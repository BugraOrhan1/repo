from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Header, status
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import jwt
import bcrypt
import re
import shutil
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from data.vehicles_seed import get_brands, get_models, get_generations, get_engines, get_ecus
import requests
import subprocess

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
if not os.environ.get('MONGO_URL'):
    load_dotenv(ROOT_DIR / 'backend' / '.env')

UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

JWT_SECRET = os.environ.get('JWT_SECRET', 'fct-super-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRE_HOURS = 24 * 7
ADMIN_EMAIL = 'admin@fast-chiptuningfiles.com'

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class UserPublic(BaseModel):
    id: str
    email: str
    firstName: str
    lastName: str
    company: str = ''
    phone: str = ''
    country: str = ''
    vatNumber: str = ''
    credits: int = 0
    is_admin: bool = False
    language: str = 'en'
    createdAt: str


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    firstName: str
    lastName: str
    company: Optional[str] = ''
    phone: Optional[str] = ''
    country: Optional[str] = ''
    vatNumber: Optional[str] = ''


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UpdateProfileIn(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    vatNumber: Optional[str] = None
    language: Optional[str] = None


class ChangePasswordIn(BaseModel):
    currentPassword: str
    newPassword: str


class MessageIn(BaseModel):
    content: str


class StatusUpdateIn(BaseModel):
    status: str  # pending | in_progress | completed | rejected


class CreditsAdjustIn(BaseModel):
    amount: int  # can be negative
    reason: Optional[str] = ''


class PurchaseIn(BaseModel):
    packageId: str


class ApprovalIn(BaseModel):
    status: str

class PlateLookupIn(BaseModel):
    plate: str


CREDIT_PACKAGES = {
    'pkg_5': {'credits': 5, 'price': 50},
    'pkg_10': {'credits': 10, 'price': 95},
    'pkg_25': {'credits': 25, 'price': 225},
    'pkg_50': {'credits': 50, 'price': 425},
    'pkg_100': {'credits': 100, 'price': 800},
}

TUNING_TYPES = [
    {'id': 'stage1_car', 'name': 'Car Tuning (Stage 1)', 'credits': 1.0, 'category': 'main'},
    {'id': 'stage2_car', 'name': 'Car Tuning (Stage 2)', 'credits': 1.2, 'category': 'main'},
    {'id': 'stage3_car', 'name': 'Car Tuning (Stage 3)', 'credits': 3.0, 'category': 'main'},
    {'id': 'tcu_stage1', 'name': 'TCU Tuning (Stage 1)', 'description': 'Includes internal torque and shifting speed faster', 'credits': 1.0, 'category': 'main'},
    {'id': 'options_car', 'name': 'Only options (Car)', 'credits': 0.0, 'category': 'main'},
    {'id': 'options_tcu', 'name': 'Only options (TCU)', 'credits': 0.0, 'category': 'main'},
    {'id': 'stage1_truck', 'name': 'Truck/Agriculture tuning (Stage 1)', 'credits': 1.0, 'category': 'main'},
    {'id': 'options_truck', 'name': 'Only options (Truck/Agriculture)', 'credits': 0.0, 'category': 'main'},
    {'id': 'checksum', 'name': 'Checksum (if possible)', 'credits': 0.5, 'category': 'main'},
    {'id': 'immo_off', 'name': 'Immo off (if possible)', 'credits': 1.0, 'category': 'main'},
    {'id': 'e85_conversion', 'name': 'E85 Conversion', 'credits': 2.0, 'category': 'main'},
    {'id': 'back_to_stock', 'name': 'Back to stock', 'credits': 0.2, 'category': 'main'},
    {'id': 'mapswitch', 'name': 'MapSwitch Simos 18.X EDC17.X Med17.X med9.X MG1 MD1', 'credits': 4.0, 'category': 'main'},
    {'id': 'review', 'name': 'Tuning file review', 'credits': 0.5, 'category': 'main'},
    {'id': 'ecu_clone', 'name': 'ECU Clone Service', 'credits': 0.5, 'category': 'main'},
]

ADDITIONAL_OPTIONS = [
    {'id': 'adblue_scr', 'name': 'AdBlue / SCR', 'credits': 1.0},
    {'id': 'adblue_dpf', 'name': 'AdBlue + DPF off', 'credits': 1.5},
    {'id': 'antilag', 'name': 'Antilag', 'credits': 1.0},
    {'id': 'cylinder_demand', 'name': 'Cylinder on Demand off', 'credits': 0.2},
    {'id': 'decat', 'name': 'Decat', 'credits': 0.2},
    {'id': 'dpf_opf', 'name': 'DPF / OPF', 'credits': 0.5},
    {'id': 'dpf_egr', 'name': 'DPF / OPF + EGR', 'credits': 0.5},
    {'id': 'dsg_fart', 'name': 'DSG Fart', 'credits': 0.5},
    {'id': 'dtc', 'name': 'DTC', 'credits': 0.5},
    {'id': 'eolys_fap', 'name': 'Eolys / FAP', 'credits': 0.5},
    {'id': 'e85_flexfuel', 'name': 'E85 FlexFuel', 'credits': 2.0},
    {'id': 'egr', 'name': 'EGR off', 'credits': 0.2},
    {'id': 'evap', 'name': 'Evaporative Emission Control System (EVAP)', 'credits': 0.2},
    {'id': 'exhaust_flaps', 'name': 'Exhaust Flaps', 'credits': 0.2},
    {'id': 'hardcut', 'name': 'Hard Cut limiter (Flames)', 'credits': 1.0},
    {'id': 'hot_cold_start', 'name': 'Hot start / Cold start FIX', 'credits': 0.5},
    {'id': 'idle_rpm', 'name': 'Idle RPM', 'credits': 0.5},
    {'id': 'injector_scaling', 'name': 'Injector scaling', 'credits': 1.0},
    {'id': 'launch_control', 'name': 'Launch Control', 'credits': 0.5},
    {'id': 'maf_off', 'name': 'MAF OFF (if possible)', 'credits': 0.5},
    {'id': 'map_sensor', 'name': 'Map sensor Set', 'credits': 0.5},
    {'id': 'neutral_rpm', 'name': 'Neutral RPM', 'credits': 0.2},
    {'id': 'nox_off', 'name': 'NOx off (only Petrol cars)', 'credits': 0.5},
    {'id': 'o2_off', 'name': 'O2 OFF', 'credits': 0.2},
    {'id': 'opf_off', 'name': 'OPF OFF', 'credits': 0.5},
    {'id': 'opf_egr', 'name': 'OPF + EGR OFF', 'credits': 0.5},
    {'id': 'perf_gauge', 'name': 'Performance Gauge BMW/Mini/VAG', 'credits': 0.0},
    {'id': 'pop_bang', 'name': 'Pop & bang/crackle map', 'credits': 1.0},
    {'id': 'pop_bang_sport', 'name': 'Pop & bang/crackle map (Sport/button)', 'credits': 1.2},
    {'id': 'readiness', 'name': 'Readiness Monitor', 'credits': 0.5},
    {'id': 'rev_limiter', 'name': 'Rev Limiter', 'credits': 0.2},
    {'id': 'warranty_patch', 'name': 'Warranty Patch (BMW/Mini/VAG)', 'credits': 1.0},
    {'id': 'sap', 'name': 'Secundairy Air Pump (SAP)', 'credits': 0.5},
    {'id': 'smoke_mapping', 'name': 'Smoke mapping (Diesel)', 'credits': 1.0},
    {'id': 'startstop_off', 'name': 'Start / Stop system off', 'credits': 0.5},
    {'id': 'startup_roar', 'name': 'Startup roar', 'credits': 0.5},
    {'id': 'swirl_flaps', 'name': 'Swirl Flaps off', 'credits': 0.5},
    {'id': 'torque_mon', 'name': 'Torque Monitoring off', 'credits': 0.5},
    {'id': 'vmax_off', 'name': 'V-Max Off', 'credits': 0.0},
    {'id': 'vmax_custom', 'name': 'V-Max Limited to custom speed', 'credits': 0.5},
]

TOOL_TYPES = ['Master', 'Slave']

READ_METHODS = [
    'Alientech Kess', 'Alientech KTAG', 'Alientech Powergate',
    'Autotuner Bench', 'Autotuner Bootmode', 'Autotuner OBD',
    'bFlash Bench', 'bFlash BOOT', 'bFlash OBD',
    'Bitbox', 'BS OBD', 'BS toolbox', 'BS Tricore Boottool',
    'CMD BDM', 'CMD Bench', 'CMD OBD', 'CMD Tricore Boottool',
    'Dimsport Genius', 'Dimsport New Trasdata',
    'Eprom programmer', 'EVC BDM', 'EVC BSL',
    'FC200 BENCH', 'FC200 OBD',
    'Femto (BMW tool)', 'FGtech',
    'FOXflash BENCH', 'FOXflash OBD',
    'Frieling i-Boot', 'Frieling i-Flash', 'Frieling SPI Wizard',
    'Galetto', 'Hptuners',
    'KT200 BENCH', 'KT200 OBD',
    'Magic Motorsport MAGPRO Bench/Flex',
    'Magic Motorsport MAGPRO Bootmode',
    'Magic Motorsport MAGPRO OBD',
    'MPPS', 'PCM-Flash',
    'Pemicro Nexus Debugger', 'Piasini Serial Suite',
    'Otherwise, namely',
]

GEARBOXES = ['5 speed', '6 speed', '7 speed', 'Automatic Transmission', 'CVT', 'DCT', 'DKG', 'DSG', 'DSG6', 'DSG7', 'Multitronic', 'SMG', 'SMG2', 'SMG3', 'Tiptronic']

OCTANE_RATINGS = ['91 AKI / 95 RON', '93 AKI / 98 RON', '95 AKI / 102 RON', 'Racegas 100+ RON / 105+ RON']

VEHICLE_TYPES = ['Car', 'Truck', 'Agriculture', 'Bike', 'Boat']

TIME_FRAMES = [
    {'id': 'asap', 'name': 'ASAP'},
    {'id': '2-3h', 'name': '2-3 hours'},
    {'id': '5-6h', 'name': '5-6 hours'},
]

# Additional brands without detailed cascade data (user picks Otherwise, namely for model/engine)
EXTRA_BRANDS = [
    'Acura', 'Alpina', 'Alpine', 'Aston Martin', 'BAIC', 'BYD', 'Bentley', 'Bestune',
    'Buick', 'CMC', 'Cadillac', 'Case IH', 'Caterpillar', 'Challenger', 'Changan',
    'Changan Nevo', 'Chery', 'Chevrolet', 'Chrysler', 'Claas', 'DAF', 'DS', 'Daewoo',
    'Dallara', 'Deepal', 'Deutz', 'Dodge', 'Donkervoort', 'Fendt', 'Ferrari',
    'Freightliner', 'GAC', 'GMC', 'GWM', 'Geely', 'Genesis', 'Hitachi', 'Holden',
    'Hongqi', 'Hummer', 'Ineos', 'Infiniti', 'Isuzu', 'JCB', 'Jac', 'Jaguar',
    'Jetour', 'John Deere', 'Krone', 'Lamborghini', 'Lamborghini Tractors', 'Lancia',
    'Lexus', 'Lincoln', 'Lindner', 'Lotus', 'Luxgen', 'Lynk & Co', 'MAN LCV',
    'MAN Trucks', 'MG', 'Mack', 'Mahindra', 'Maserati', 'Massey Ferguson', 'Mc Cormick',
    'McLaren', 'Mercedes-Benz Trucks', 'Mercury', 'New Holland', 'Oldsmobile', 'Pontiac',
    'Proton', 'Renault Trucks', 'Roewe', 'Rolls Royce', 'Rover', 'Saab', 'Same',
    'Saturn', 'Scania Trucks', 'Smart', 'SsangYong', 'Steyr', 'Suzuki', 'Tata',
    'Valtra', 'Vauxhall', 'Volvo Trucks', 'WEY',
]


# ---------- Helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), h.encode())
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {
        'sub': user_id,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def normalize_text(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', (value or '').lower())

def normalize_plate(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', (value or '').upper())

def parse_year_from_date(value: str) -> Optional[int]:
    if not value:
        return None
    match = re.match(r'^(\d{4})', str(value))
    return int(match.group(1)) if match else None

def brand_family_key(value: str) -> str:
    normalized = normalize_text(value)
    if 'volkswagen' in normalized or normalized == 'vw':
        return 'volkswagen'
    if 'mercedes' in normalized:
        return 'mercedes'
    if 'skoda' in normalized:
        return 'skoda'
    if 'seat' in normalized:
        return 'seat'
    if 'audi' in normalized:
        return 'audi'
    if 'mini' in normalized:
        return 'mini'
    if 'bmw' in normalized:
        return 'bmw'
    if 'opel' in normalized or 'vauxhall' in normalized:
        return 'opel'
    if 'renault' in normalized:
        return 'renault'
    return normalized


def candidate_aliases_for_brand(brand: str, target_norm: str, fuel_text: str) -> List[str]:
    family = brand_family_key(brand)
    aliases: List[str] = []

    if family == 'volkswagen':
        if 'golf' in target_norm:
            aliases.extend(['golfgte', 'golfgtd', 'golfgti', 'golfr', 'golf'])
        elif 'passat' in target_norm:
            aliases.extend(['passatgte', 'passat'])
        elif 'polo' in target_norm:
            aliases.extend(['pologti', 'polo'])
        elif 'tiguan' in target_norm:
            aliases.append('tiguan')
        elif 'troc' in target_norm:
            aliases.extend(['trocr', 'troc'])
        else:
            aliases.extend(['golf', 'polo', 'passat', 'tiguan', 'troc', 'arteon'])
        if 'hybrid' in fuel_text or 'elektr' in fuel_text:
            aliases[:0] = ['golfgte', 'passatgte']
    elif family == 'audi':
        if 'q3' in target_norm:
            aliases.extend(['q3sportback', 'q3'])
        elif 'q5' in target_norm:
            aliases.append('q5')
        elif 'q7' in target_norm:
            aliases.append('q7')
        elif 'a1' in target_norm:
            aliases.append('a1')
        elif 'a3' in target_norm:
            aliases.extend(['rs3', 's3', 'a3'])
        elif 'a4' in target_norm:
            aliases.extend(['s4', 'a4'])
        elif 'a5' in target_norm:
            aliases.extend(['s5', 'a5'])
        elif 'a6' in target_norm:
            aliases.extend(['s6', 'a6'])
        else:
            aliases.extend(['a1', 'a3', 'a4', 'a5', 'a6', 'q3', 'q5', 'q7'])
    elif family == 'seat':
        if 'cupra' in target_norm:
            aliases.extend(['leoncupra', 'ibizacupra', 'cupra', 'leon', 'ibiza'])
        elif 'leon' in target_norm:
            aliases.extend(['leoncupra', 'leon'])
        elif 'ibiza' in target_norm:
            aliases.append('ibiza')
        else:
            aliases.extend(['leon', 'ibiza', 'arona', 'ateca', 'tarraco'])
    elif family == 'skoda':
        if 'octavia' in target_norm:
            aliases.extend(['octaviars', 'octavia'])
        elif 'superb' in target_norm:
            aliases.append('superb')
        elif 'kodiaq' in target_norm:
            aliases.append('kodiaq')
        elif 'karoq' in target_norm:
            aliases.append('karoq')
        else:
            aliases.extend(['fabia', 'octavia', 'superb', 'kodiaq', 'karoq'])
    elif family == 'bmw':
        if target_norm.startswith('x1'):
            aliases.append('x1')
        elif target_norm.startswith('x2'):
            aliases.append('x2')
        elif target_norm.startswith('x3'):
            aliases.append('x3')
        elif target_norm.startswith('x4'):
            aliases.append('x4')
        elif target_norm.startswith('x5'):
            aliases.append('x5')
        elif target_norm.startswith('x6'):
            aliases.append('x6')
        elif target_norm.startswith('x7'):
            aliases.append('x7')
        elif target_norm.startswith('m2'):
            aliases.extend(['m2competition', 'm2'])
        elif target_norm.startswith('m3'):
            aliases.extend(['m3competition', 'm3', 'm340i'])
        elif target_norm.startswith('m4'):
            aliases.extend(['m4competition', 'm4'])
        elif target_norm.startswith('m5'):
            aliases.extend(['m5competition', 'm5', 'm550d'])
        else:
            match = re.match(r'^(\d)', target_norm)
            if match:
                aliases.append(f'{match.group(1)}series')
            aliases.extend(['1series', '2series', '3series', '4series', '5series', '6series', '7series'])
    elif family == 'mini':
        if 'countryman' in target_norm:
            aliases.extend(['countrymanjcw', 'countryman'])
        elif 'jcw' in target_norm:
            aliases.extend(['countrymanjcw', 'jcw'])
        else:
            aliases.extend(['coopers', 'cooper', 'countryman', 'jcw'])
    elif family == 'mercedes':
        if target_norm.startswith('a35'):
            aliases.extend(['a35amg', 'aclass'])
        elif target_norm.startswith('a45'):
            aliases.extend(['a45amg', 'aclass'])
        elif target_norm.startswith('c43'):
            aliases.extend(['c43amg', 'cclass'])
        elif target_norm.startswith('c63'):
            aliases.extend(['c63amg', 'cclass'])
        elif target_norm.startswith('e63'):
            aliases.extend(['e63amg', 'eclass'])
        elif target_norm.startswith('gla45'):
            aliases.extend(['gla45amg', 'gla'])
        elif target_norm.startswith('gla'):
            aliases.append('gla')
        elif target_norm.startswith('glc'):
            aliases.append('glc')
        elif target_norm.startswith('gle'):
            aliases.append('gle')
        elif target_norm.startswith('sprinter'):
            aliases.append('sprinter')
        elif target_norm.startswith('s'):
            aliases.append('sclass')
        elif target_norm.startswith('e'):
            aliases.append('eclass')
        elif target_norm.startswith('c'):
            aliases.append('cclass')
        elif target_norm.startswith('a'):
            aliases.append('aclass')
        else:
            aliases.extend(['aclass', 'cclass', 'eclass', 'sclass', 'gla', 'glc', 'gle', 'sprinter'])
    elif family == 'opel':
        if 'opc' in target_norm:
            aliases.extend(['astraopc', 'astra'])
        elif 'corsa' in target_norm:
            aliases.append('corsa')
        elif 'astra' in target_norm:
            aliases.append('astra')
        elif 'insignia' in target_norm:
            aliases.append('insignia')
        elif 'mokka' in target_norm:
            aliases.append('mokka')
        elif 'grandland' in target_norm:
            aliases.append('grandland')
        elif 'vivaro' in target_norm:
            aliases.append('vivaro')
        else:
            aliases.extend(['corsa', 'astra', 'insignia', 'mokka', 'grandland', 'vivaro'])
    elif family == 'renault':
        if 'rs' in target_norm:
            aliases.extend(['meganers', 'cliors', 'megane', 'clio'])
        elif 'clio' in target_norm:
            aliases.append('clio')
        elif 'megane' in target_norm:
            aliases.append('megane')
        elif 'captur' in target_norm:
            aliases.append('captur')
        elif 'kadjar' in target_norm:
            aliases.append('kadjar')
        elif 'trafic' in target_norm:
            aliases.append('trafic')
        elif 'master' in target_norm:
            aliases.append('master')
        else:
            aliases.extend(['clio', 'megane', 'captur', 'kadjar', 'trafic', 'master'])

    return aliases


def best_text_match(candidates: List[str], target: str, brand: str = '', fuel_text: str = '') -> Optional[str]:
    target_norm = normalize_text(target)
    if not candidates or not target_norm:
        return candidates[0] if candidates else None
    fuel_norm = (fuel_text or '').lower()
    for alias in candidate_aliases_for_brand(brand, target_norm, fuel_norm):
        match = next((item for item in candidates if alias in normalize_text(item)), None)
        if match:
            return match
    exact = [item for item in candidates if normalize_text(item) == target_norm]
    if exact:
        return exact[0]
    contains = [item for item in candidates if normalize_text(item) in target_norm or target_norm in normalize_text(item)]
    if contains:
        return sorted(contains, key=lambda item: len(normalize_text(item)), reverse=True)[0]
    return sorted(candidates, key=lambda item: abs(len(normalize_text(item)) - len(target_norm)))[0]

def best_generation_match(generations: List[str], year: Optional[int]) -> Optional[str]:
    if not generations:
        return None
    if year is None:
        return generations[0]
    for generation in generations:
        match = re.search(r'(\d{4})\D+(\d{4}|now)', generation, re.IGNORECASE)
        if not match:
            continue
        start_year = int(match.group(1))
        end_token = match.group(2).lower()
        end_year = 9999 if end_token == 'now' else int(end_token)
        if start_year <= year <= end_year:
            return generation
    return generations[0]


def public_user(u: dict) -> dict:
    if not u:
        return None
    return {
        'id': u['_id'],
        'email': u['email'],
        'firstName': u.get('firstName', ''),
        'lastName': u.get('lastName', ''),
        'company': u.get('company', ''),
        'phone': u.get('phone', ''),
        'country': u.get('country', ''),
        'vatNumber': u.get('vatNumber', ''),
        'credits': u.get('credits', 0),
        'is_admin': u.get('is_admin', False),
        'approval_status': u.get('approval_status', 'pending'),
        'language': u.get('language', 'en'),
        'createdAt': u.get('createdAt', ''),
    }


def public_file(f: dict) -> dict:
    return {
        'id': f['_id'],
        'userId': f.get('userId'),
        'userEmail': f.get('userEmail'),
        'userName': f.get('userName'),
        'fileName': f.get('fileName'),
        'vehicle': f.get('vehicle'),
        'brand': f.get('brand'),
        'model': f.get('model'),
        'generation': f.get('generation'),
        'engine': f.get('engine'),
        'engineHp': f.get('engineHp'),
        'engineKw': f.get('engineKw'),
        'year': f.get('year'),
        'gearbox': f.get('gearbox'),
        'licensePlate': f.get('licensePlate'),
        'vin': f.get('vin'),
        'octane': f.get('octane'),
        'ecu': f.get('ecu'),
        'toolType': f.get('toolType'),
        'readMethod': f.get('readMethod'),
        'hardwareNumber': f.get('hardwareNumber'),
        'softwareNumber': f.get('softwareNumber'),
        'tuningType': f.get('tuningType'),
        'tuningOptions': f.get('tuningOptions', []),
        'modifiedParts': f.get('modifiedParts'),
        'modifiedPartsDetails': f.get('modifiedPartsDetails'),
        'timeFrame': f.get('timeFrame'),
        'status': f.get('status', 'pending'),
        'credits': f.get('credits', 0),
        'note': f.get('note', ''),
        'uploadedAt': f.get('uploadedAt'),
        'completedAt': f.get('completedAt'),
        'tunedFileName': f.get('tunedFileName'),
        'hasOriginal': bool(f.get('originalPath')),
        'hasTuned': bool(f.get('tunedPath')),
    }


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Missing token')
    token = authorization.split(' ', 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get('sub')
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail='Invalid token')
    user = await db.users.find_one({'_id': user_id})
    if not user:
        raise HTTPException(status_code=401, detail='User not found')
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get('is_admin'):
        raise HTTPException(status_code=403, detail='Admin access required')
    return user


async def add_notification(user_id: str, ntype: str, title: str, body: str = '', file_id: str = None):
    n = {
        '_id': str(uuid.uuid4()),
        'userId': user_id,
        'type': ntype,
        'title': title,
        'body': body,
        'fileId': file_id,
        'read': False,
        'createdAt': now_iso(),
    }
    await db.notifications.insert_one(n)


# ---------- Auth Routes ----------
@api_router.post("/auth/register")
async def register(data: RegisterIn):
    existing = await db.users.find_one({'email': data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail='Password must be at least 6 characters')
    is_admin = data.email.lower() == ADMIN_EMAIL
    user = {
        '_id': str(uuid.uuid4()),
        'email': data.email.lower(),
        'password': hash_password(data.password),
        'firstName': data.firstName,
        'lastName': data.lastName,
        'company': data.company or '',
        'phone': data.phone or '',
        'country': data.country or '',
        'vatNumber': data.vatNumber or '',
        'credits': 0,
        'is_admin': is_admin,
        'language': 'en',
        'createdAt': now_iso(),
    }
    await db.users.insert_one(user)
    token = create_token(user['_id'])
    return {'token': token, 'user': public_user(user)}


@api_router.post("/auth/login")
async def login(data: LoginIn):
    user = await db.users.find_one({'email': data.email.lower()})
    if not user or not verify_password(data.password, user['password']):
        raise HTTPException(status_code=401, detail='Invalid email or password')
    # Auto-promote admin email
    if user['email'] == ADMIN_EMAIL and not user.get('is_admin'):
        await db.users.update_one({'_id': user['_id']}, {'$set': {'is_admin': True}})
        user['is_admin'] = True
    token = create_token(user['_id'])
    return {'token': token, 'user': public_user(user)}


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return public_user(user)


@api_router.patch("/auth/me")
async def update_me(data: UpdateProfileIn, user=Depends(get_current_user)):
    update = {k: v for k, v in data.dict().items() if v is not None}
    if update:
        await db.users.update_one({'_id': user['_id']}, {'$set': update})
    new_user = await db.users.find_one({'_id': user['_id']})
    return public_user(new_user)


@api_router.post("/auth/change-password")
async def change_password(data: ChangePasswordIn, user=Depends(get_current_user)):
    if not verify_password(data.currentPassword, user['password']):
        raise HTTPException(status_code=400, detail='Current password is incorrect')
    if len(data.newPassword) < 6:
        raise HTTPException(status_code=400, detail='Password must be at least 6 characters')
    await db.users.update_one({'_id': user['_id']}, {'$set': {'password': hash_password(data.newPassword)}})
    return {'success': True}


# ---------- Files Routes ----------
@api_router.post("/files")
async def upload_file(
    file: UploadFile = File(...),
    vehicle: str = Form(...),
    ecu: str = Form(...),
    tuningOptions: str = Form(''),  # comma-separated
    credits: int = Form(...),
    note: str = Form(''),
    brand: str = Form(''),
    model: str = Form(''),
    generation: str = Form(''),
    engine: str = Form(''),
    engineHp: str = Form(''),
    engineKw: str = Form(''),
    year: str = Form(''),
    gearbox: str = Form(''),
    licensePlate: str = Form(''),
    vin: str = Form(''),
    octane: str = Form(''),
    toolType: str = Form(''),
    readMethod: str = Form(''),
    hardwareNumber: str = Form(''),
    softwareNumber: str = Form(''),
    tuningType: str = Form(''),
    modifiedParts: str = Form(''),
    modifiedPartsDetails: str = Form(''),
    timeFrame: str = Form(''),
    user=Depends(get_current_user),
):
    if user.get('credits', 0) < credits:
        raise HTTPException(status_code=400, detail='Not enough credits')

    file_id = str(uuid.uuid4())
    safe_name = f"{file_id}_{Path(file.filename).name}"
    path = UPLOAD_DIR / safe_name
    with open(path, 'wb') as buf:
        shutil.copyfileobj(file.file, buf)

    options_list = [o.strip() for o in tuningOptions.split(',') if o.strip()]

    doc = {
        '_id': file_id,
        'userId': user['_id'],
        'userEmail': user['email'],
        'userName': f"{user.get('firstName','')} {user.get('lastName','')}".strip(),
        'fileName': file.filename,
        'vehicle': vehicle,
        'brand': brand,
        'model': model,
        'generation': generation,
        'engine': engine,
        'engineHp': engineHp,
        'engineKw': engineKw,
        'year': year,
        'gearbox': gearbox,
        'licensePlate': licensePlate,
        'vin': vin,
        'octane': octane,
        'ecu': ecu,
        'toolType': toolType,
        'readMethod': readMethod,
        'hardwareNumber': hardwareNumber,
        'softwareNumber': softwareNumber,
        'tuningType': tuningType,
        'tuningOptions': options_list,
        'modifiedParts': modifiedParts,
        'modifiedPartsDetails': modifiedPartsDetails,
        'timeFrame': timeFrame,
        'status': 'pending',
        'credits': credits,
        'note': note,
        'uploadedAt': now_iso(),
        'completedAt': None,
        'originalPath': str(path),
        'tunedPath': None,
        'tunedFileName': None,
    }
    await db.files.insert_one(doc)

    # Deduct credits
    await db.users.update_one({'_id': user['_id']}, {'$inc': {'credits': -credits}})
    await db.transactions.insert_one({
        '_id': str(uuid.uuid4()),
        'userId': user['_id'],
        'type': 'usage',
        'amount': -credits,
        'fileId': file_id,
        'date': now_iso(),
    })
    # Notify admins
    async for adm in db.users.find({'is_admin': True}):
        await add_notification(adm['_id'], 'new_file', 'New file submitted', f"{user['email']} uploaded {file.filename}", file_id)

    return public_file(doc)


@api_router.get("/files")
async def list_files(user=Depends(get_current_user)):
    cursor = db.files.find({'userId': user['_id']}).sort('uploadedAt', -1)
    items = [public_file(f) async for f in cursor]
    return items


@api_router.get("/files/{file_id}")
async def get_file(file_id: str, user=Depends(get_current_user)):
    f = await db.files.find_one({'_id': file_id})
    if not f:
        raise HTTPException(status_code=404, detail='File not found')
    if f['userId'] != user['_id'] and not user.get('is_admin'):
        raise HTTPException(status_code=403, detail='Forbidden')
    return public_file(f)


@api_router.get("/files/{file_id}/download/original")
async def download_original(file_id: str, user=Depends(get_current_user)):
    f = await db.files.find_one({'_id': file_id})
    if not f:
        raise HTTPException(status_code=404)
    if f['userId'] != user['_id'] and not user.get('is_admin'):
        raise HTTPException(status_code=403)
    if not f.get('originalPath') or not Path(f['originalPath']).exists():
        raise HTTPException(status_code=404, detail='Original file missing')
    return FileResponse(f['originalPath'], filename=f['fileName'])


@api_router.get("/files/{file_id}/download/tuned")
async def download_tuned(file_id: str, user=Depends(get_current_user)):
    f = await db.files.find_one({'_id': file_id})
    if not f:
        raise HTTPException(status_code=404)
    if f['userId'] != user['_id'] and not user.get('is_admin'):
        raise HTTPException(status_code=403)
    if not f.get('tunedPath') or not Path(f['tunedPath']).exists():
        raise HTTPException(status_code=404, detail='Tuned file not yet available')
    return FileResponse(f['tunedPath'], filename=f.get('tunedFileName') or 'tuned.bin')


# ---------- Messages ----------
@api_router.get("/files/{file_id}/messages")
async def get_messages(file_id: str, user=Depends(get_current_user)):
    f = await db.files.find_one({'_id': file_id})
    if not f:
        raise HTTPException(status_code=404)
    if f['userId'] != user['_id'] and not user.get('is_admin'):
        raise HTTPException(status_code=403)
    cursor = db.messages.find({'fileId': file_id}).sort('createdAt', 1)
    items = []
    async for m in cursor:
        items.append({
            'id': m['_id'],
            'fileId': m['fileId'],
            'senderId': m['senderId'],
            'senderName': m.get('senderName', ''),
            'senderRole': m.get('senderRole', 'user'),
            'content': m['content'],
            'createdAt': m['createdAt'],
        })
    return items


@api_router.post("/files/{file_id}/messages")
async def post_message(file_id: str, data: MessageIn, user=Depends(get_current_user)):
    f = await db.files.find_one({'_id': file_id})
    if not f:
        raise HTTPException(status_code=404)
    if f['userId'] != user['_id'] and not user.get('is_admin'):
        raise HTTPException(status_code=403)
    msg = {
        '_id': str(uuid.uuid4()),
        'fileId': file_id,
        'senderId': user['_id'],
        'senderName': f"{user.get('firstName','')} {user.get('lastName','')}".strip() or user['email'],
        'senderRole': 'admin' if user.get('is_admin') else 'user',
        'content': data.content,
        'createdAt': now_iso(),
    }
    await db.messages.insert_one(msg)
    # Notify the other party
    if user.get('is_admin'):
        await add_notification(f['userId'], 'new_message', 'New message from support', data.content[:80], file_id)
    else:
        async for adm in db.users.find({'is_admin': True}):
            await add_notification(adm['_id'], 'new_message', f'New message from {user["email"]}', data.content[:80], file_id)
    return {
        'id': msg['_id'], 'fileId': file_id, 'senderId': user['_id'],
        'senderName': msg['senderName'], 'senderRole': msg['senderRole'],
        'content': msg['content'], 'createdAt': msg['createdAt'],
    }


# ---------- Credits ----------
@api_router.get("/credits/packages")
async def credit_packages():
    return [{'id': k, **v} for k, v in CREDIT_PACKAGES.items()]


@api_router.post("/credits/purchase")
async def purchase_credits(data: PurchaseIn, user=Depends(get_current_user)):
    pkg = CREDIT_PACKAGES.get(data.packageId)
    if not pkg:
        raise HTTPException(status_code=400, detail='Invalid package')
    await db.users.update_one({'_id': user['_id']}, {'$inc': {'credits': pkg['credits']}})
    tx = {
        '_id': str(uuid.uuid4()),
        'userId': user['_id'],
        'type': 'purchase',
        'amount': pkg['credits'],
        'price': pkg['price'],
        'method': 'Multisafepay',
        'date': now_iso(),
    }
    await db.transactions.insert_one(tx)
    new_user = await db.users.find_one({'_id': user['_id']})
    return {'user': public_user(new_user), 'transaction': {**tx, 'id': tx['_id']}}


@api_router.get("/credits/transactions")
async def list_transactions(user=Depends(get_current_user)):
    cursor = db.transactions.find({'userId': user['_id']}).sort('date', -1)
    items = []
    async for t in cursor:
        items.append({
            'id': t['_id'], 'type': t['type'], 'amount': t['amount'],
            'price': t.get('price'), 'method': t.get('method'),
            'fileId': t.get('fileId'), 'date': t['date'],
        })
    return items


# ---------- Notifications ----------
@api_router.get("/notifications")
async def list_notifications(user=Depends(get_current_user)):
    cursor = db.notifications.find({'userId': user['_id']}).sort('createdAt', -1).limit(50)
    items = []
    async for n in cursor:
        items.append({
            'id': n['_id'], 'type': n['type'], 'title': n['title'],
            'body': n.get('body', ''), 'fileId': n.get('fileId'),
            'read': n.get('read', False), 'createdAt': n['createdAt'],
        })
    return items


@api_router.post("/notifications/read-all")
async def read_all_notifications(user=Depends(get_current_user)):
    await db.notifications.update_many({'userId': user['_id'], 'read': False}, {'$set': {'read': True}})
    return {'success': True}


# ---------- Admin Routes ----------
@api_router.get("/admin/users")
async def admin_list_users(admin=Depends(require_admin)):
    cursor = db.users.find({}).sort('createdAt', -1)
    return [public_user(u) async for u in cursor]


@api_router.patch("/admin/users/{user_id}/credits")
async def admin_adjust_credits(user_id: str, data: CreditsAdjustIn, admin=Depends(require_admin)):
    user = await db.users.find_one({'_id': user_id})
    if not user:
        raise HTTPException(status_code=404)
    await db.users.update_one({'_id': user_id}, {'$inc': {'credits': data.amount}})
    await db.transactions.insert_one({
        '_id': str(uuid.uuid4()),
        'userId': user_id,
        'type': 'adjustment',
        'amount': data.amount,
        'method': f"Admin: {data.reason or 'manual adjustment'}",
        'date': now_iso(),
    })
    await add_notification(user_id, 'credits_changed',
                          f"Credits {'added' if data.amount > 0 else 'removed'}",
                          f"{data.amount:+d} credits by admin")
    new_user = await db.users.find_one({'_id': user_id})
    return public_user(new_user)


@api_router.patch("/admin/users/{user_id}/approval")
async def admin_set_approval(user_id: str, data: ApprovalIn, admin=Depends(require_admin)):
    user = await db.users.find_one({'_id': user_id})
    if not user:
        raise HTTPException(status_code=404)
    if data.status not in ('approved', 'rejected'):
        raise HTTPException(status_code=400, detail='Invalid status')
    await db.users.update_one({'_id': user_id}, {'$set': {'approval_status': data.status}})
    await add_notification(user_id, 'account_' + data.status, 'Account ' + data.status.capitalize(), f"Your account was {data.status} by admin")
    new_user = await db.users.find_one({'_id': user_id})
    return public_user(new_user)


@api_router.get("/admin/files")
async def admin_list_all_files(admin=Depends(require_admin), status_filter: Optional[str] = None):
    q = {}
    if status_filter and status_filter != 'all':
        q['status'] = status_filter
    cursor = db.files.find(q).sort('uploadedAt', -1)
    return [public_file(f) async for f in cursor]


@api_router.patch("/admin/files/{file_id}/status")
async def admin_update_status(file_id: str, data: StatusUpdateIn, admin=Depends(require_admin)):
    valid = ['pending', 'in_progress', 'completed', 'rejected']
    if data.status not in valid:
        raise HTTPException(status_code=400, detail='Invalid status')
    f = await db.files.find_one({'_id': file_id})
    if not f:
        raise HTTPException(status_code=404)
    update = {'status': data.status}
    if data.status == 'completed':
        update['completedAt'] = now_iso()
    await db.files.update_one({'_id': file_id}, {'$set': update})
    await add_notification(f['userId'], 'status_changed',
                          f"File status: {data.status}",
                          f"{f['fileName']} is now {data.status}", file_id)
    new_f = await db.files.find_one({'_id': file_id})
    return public_file(new_f)


@api_router.post("/admin/files/{file_id}/upload-tuned")
async def admin_upload_tuned(file_id: str, file: UploadFile = File(...), admin=Depends(require_admin)):
    f = await db.files.find_one({'_id': file_id})
    if not f:
        raise HTTPException(status_code=404)
    safe_name = f"tuned_{file_id}_{Path(file.filename).name}"
    path = UPLOAD_DIR / safe_name
    with open(path, 'wb') as buf:
        shutil.copyfileobj(file.file, buf)
    await db.files.update_one({'_id': file_id}, {'$set': {
        'tunedPath': str(path),
        'tunedFileName': file.filename,
        'status': 'completed',
        'completedAt': now_iso(),
    }})
    await add_notification(f['userId'], 'file_completed',
                          'Your tuned file is ready!',
                          f"{f['fileName']} has been tuned and is ready for download.", file_id)
    new_f = await db.files.find_one({'_id': file_id})
    return public_file(new_f)


@api_router.get("/admin/stats")
async def admin_stats(admin=Depends(require_admin)):
    total_users = await db.users.count_documents({})
    total_files = await db.files.count_documents({})
    pending = await db.files.count_documents({'status': 'pending'})
    in_progress = await db.files.count_documents({'status': 'in_progress'})
    completed = await db.files.count_documents({'status': 'completed'})
    return {
        'totalUsers': total_users,
        'totalFiles': total_files,
        'pending': pending,
        'inProgress': in_progress,
        'completed': completed,
    }


@api_router.get("/")
async def root():
    return {"message": "Fast Chiptuningfiles API", "version": "1.0"}


# ---------- Vehicles (cascading dropdown) ----------
@api_router.get("/vehicles/brands")
async def vehicles_brands():
    detailed = get_brands()
    combined = sorted(set(detailed + EXTRA_BRANDS))
    return combined


@api_router.get("/vehicles/models")
async def vehicles_models(brand: str):
    models = get_models(brand)
    if not models:
        return ['Otherwise, namely']
    return models + ['Otherwise, namely']


@api_router.get("/vehicles/generations")
async def vehicles_generations(brand: str, model: str):
    if model == 'Otherwise, namely':
        return ['Otherwise, namely']
    gens = get_generations(brand, model)
    if not gens:
        return ['Otherwise, namely']
    return gens + ['Otherwise, namely']


@api_router.get("/vehicles/engines")
async def vehicles_engines(brand: str, model: str, generation: str):
    if generation == 'Otherwise, namely' or model == 'Otherwise, namely':
        return [{'name': 'Otherwise, namely', 'hp': 0, 'kw': 0, 'fuel': 'Other', 'ecus': []}]
    engs = get_engines(brand, model, generation)
    if not engs:
        return [{'name': 'Otherwise, namely', 'hp': 0, 'kw': 0, 'fuel': 'Other', 'ecus': []}]
    return engs + [{'name': 'Otherwise, namely', 'hp': 0, 'kw': 0, 'fuel': 'Other', 'ecus': []}]


@api_router.get("/vehicles/ecus")
async def vehicles_ecus(brand: str, model: str, generation: str, engine: str):
    if engine == 'Otherwise, namely':
        return ['Otherwise, namely']
    ecus = get_ecus(brand, model, generation, engine)
    if not ecus:
        return ['Otherwise, namely']
    return ecus + ['Otherwise, namely']


@api_router.get("/vehicles/lookup-license-plate")
async def lookup_license_plate(plate: str):
    normalized_plate = normalize_plate(plate)
    if len(normalized_plate) < 5:
        raise HTTPException(status_code=400, detail='Kenteken is te kort. Gebruik minimaal 5 tekens zonder streepjes.')

    base_url = 'https://opendata.rdw.nl/resource/m9d7-ebf2.json'
    fuel_url = 'https://opendata.rdw.nl/resource/8ys7-d773.json'

    try:
        vehicle_response = requests.get(
            base_url,
            params={
                '$select': 'kenteken,merk,handelsbenaming,datum_eerste_toelating',
                '$where': f"kenteken='{normalized_plate}'",
                '$limit': '1',
            },
            timeout=10,
        )
        vehicle_response.raise_for_status()
        vehicle_rows = vehicle_response.json()

        if not vehicle_rows:
            return {'found': False, 'plate': normalized_plate}

        vehicle = vehicle_rows[0]
        fuel_rows = requests.get(
            fuel_url,
            params={
                '$select': 'brandstof_omschrijving',
                '$where': f"kenteken='{normalized_plate}'",
                '$limit': '10',
            },
            timeout=10,
        ).json()
        fuel_text = ' '.join((row.get('brandstof_omschrijving') or '') for row in fuel_rows).lower()
        brand = best_text_match(get_brands() + EXTRA_BRANDS, vehicle.get('merk', ''))
        models = get_models(brand) if brand else []
        rdw_model = vehicle.get('handelsbenaming', '')

        model = None
        rdw_model_norm = normalize_text(rdw_model)
        if models:
            if ('hybrid' in fuel_text or 'elektr' in fuel_text) and any(normalize_text(item) == 'golfgte' for item in models):
                model = next((item for item in models if normalize_text(item) == 'golfgte'), None)
            elif 'gti' in rdw_model_norm and any('gti' in normalize_text(item) for item in models):
                model = next((item for item in models if 'gti' in normalize_text(item)), None)
            else:
                model = best_text_match(models, rdw_model)

        generations = get_generations(brand, model) if brand and model else []
        year = parse_year_from_date(vehicle.get('datum_eerste_toelating'))
        generation = best_generation_match(generations, year) if generations else None

        engine_options = get_engines(brand, model, generation) if brand and model and generation else []
        engine = None
        chosen_engine = None
        if engine_options:
            if 'hybrid' in fuel_text or 'elektr' in fuel_text:
                chosen_engine = next((item for item in engine_options if 'ehybrid' in normalize_text(item.get('name', '')) or item.get('fuel') == 'H'), None)
            elif 'diesel' in fuel_text:
                chosen_engine = next((item for item in engine_options if item.get('fuel') == 'D'), None)
            elif 'benzine' in fuel_text or 'petrol' in fuel_text:
                chosen_engine = next((item for item in engine_options if item.get('fuel') == 'P'), None)
            if not chosen_engine:
                chosen_engine = engine_options[0]
            engine = chosen_engine.get('name')

        ecu_options = get_ecus(brand, model, generation, engine) if brand and model and generation and engine else []

        return {
            'found': True,
            'plate': normalized_plate,
            'year': year,
            'brand': brand,
            'model': model,
            'generation': generation,
            'engine': engine,
            'engineHp': chosen_engine.get('hp') if chosen_engine else None,
            'engineKw': chosen_engine.get('kw') if chosen_engine else None,
            'fuel': chosen_engine.get('fuel') if chosen_engine else None,
            'ecu': ecu_options[0] if ecu_options else None,
            'models': models,
            'generations': generations,
            'engines': engine_options,
            'ecus': ecu_options,
            'source': 'rdw',
        }
    except requests.RequestException as error:
        raise HTTPException(status_code=502, detail=f'Kenteken lookup mislukt: {error}')


# ---------- Form options ----------
@api_router.get("/options/tuning-types")
async def options_tuning_types():
    return TUNING_TYPES


@api_router.get("/options/additional")
async def options_additional():
    return ADDITIONAL_OPTIONS


@api_router.get("/options/tools")
async def options_tools():
    return {
        'toolTypes': TOOL_TYPES,
        'readMethods': READ_METHODS,
        'gearboxes': GEARBOXES,
        'octaneRatings': OCTANE_RATINGS,
        'vehicleTypes': VEHICLE_TYPES,
        'timeFrames': TIME_FRAMES,
    }


# Seed admin user on startup
@app.on_event("startup")
async def seed_admin():
    existing = await db.users.find_one({'email': ADMIN_EMAIL})
    if not existing:
        admin_user = {
            '_id': str(uuid.uuid4()),
            'email': ADMIN_EMAIL,
            'password': hash_password('admin1234'),
            'firstName': 'Admin',
            'lastName': 'User',
            'company': 'Fast Chiptuningfiles',
            'phone': '',
            'country': 'Netherlands',
            'vatNumber': '',
            'credits': 9999,
            'is_admin': True,
            'language': 'en',
            'createdAt': now_iso(),
        }
        await db.users.insert_one(admin_user)
        logging.info(f"Seeded admin user: {ADMIN_EMAIL} / admin1234")


app.include_router(api_router)


@app.get("/api/version")
async def api_version_root():
    commit = None
    try:
        commit = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=str(ROOT_DIR), stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        commit = None
    return {'commit': commit, 'time': now_iso()}


# Simple runtime version endpoint to help verify deployed code
@api_router.get("/version")
async def api_version():
    commit = None
    try:
        commit = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=str(ROOT_DIR), stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        commit = None
    return {'commit': commit, 'time': now_iso()}

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
