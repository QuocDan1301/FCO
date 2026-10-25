import { asset } from './asset';
import excelOverrides from './excel-overrides.json';
import { primePlayers } from './primePlayers';
import { vietnamPlayers } from './vietnamPlayers';
import { prmPlayers } from './prmPlayers';
import { mdlPlayers } from './mdlPlayers';
import { ambPlayers } from './ambPlayers';
import { emptyBridge, isBridgeState, resolveUpgrade, type BridgeState, type UpgradeRole } from './upgrade/engine';
import type { Rng } from './upgrade/rng';
export type Tier = 'origin' | 'stellar' | 'eternal' | 'prime' | 'vietnam' | 'prm' | 'mdl' | 'amb';
// Thứ tự mùa khớp với Pack.weights (tỷ lệ % ra từng mùa).
export const TIERS: readonly Tier[] = ['origin', 'stellar', 'eternal', 'prime', 'vietnam', 'prm', 'mdl', 'amb'];
export type Player = { id: number; name: string; ovr: number; pos: string; nation: string; flag: string; club: string; tier: Tier; image?: string; value?: number; wage?: number; cardFace?: string; teamLogo?: string };
export type Card = { uid: string; playerId: number; level: number; received: number };
export type Entry = { id: string; time: number; type: 'pack' | 'upgrade' | 'gift' | 'market' | 'shop'; title: string; detail: string; success?: boolean };
export type Save = { version: 1; balance: number; cards: Card[]; history: Entry[]; daily: string; opened: number; upgrades: number; sound: boolean; reduced: boolean; quick?: boolean; light?: boolean; unopened?: Record<string, number>; prepaid?: Record<string, number>; bridge?: BridgeState; squad?: string[]; locked?: string[]; protection?: { pct: number; fixed: boolean } };
// back: ảnh mặt sau thẻ của gói (hiện ở danh sách gói và màn chuẩn bị mở); không có thì dùng hình gói mặc định.
// tunnel: ảnh nền chỉ hiện một lần trên cặp màn LED ở cửa hầm; các màn phía sau tắt.
// accent: màu đèn LED / khung của đường hầm khi mở gói; không có thì dùng màu vàng mặc định.
// stage: màu bục sân khấu (top) và vòng viền (ring) khi thẻ xuất hiện; led: màu khung LED đổi sang lúc đó (bỏ trống thì giữ accent).
export type Pack = { id: string; name: string; short: string; price: number; weights: [number, number, number, number, number, number, number, number]; description: string; range: string; color: string; back?: string; tunnel?: string; accent?: string; stage?: { top: string; ring: string; led?: string } };
const no7TeamLogo = asset('/assets/no7-team.webp');
export const seasons: Record<Tier, string> = { origin: 'NO.7', stellar: '26TS', eternal: 'ICON TM', prime: 'INFINITE PRIME', vietnam: 'VIETNAM', prm: 'PRIME', mdl: 'MEDALIST', amb: 'FC AMBASSADOR' };
export const players: Player[] = [
  { id: 1, name: 'Ronaldo', ovr: 126, pos: 'ST', nation: 'Brazil', flag: 'BR', club: 'Milano', tier: 'eternal', value: 1800000, wage: 34, cardFace: asset('/assets/ronaldo-card.webp') },
  { id: 31, name: 'Pelé', ovr: 127, pos: 'CF', nation: 'Brazil', flag: 'BR', club: 'Santos', tier: 'eternal', value: 1300000, wage: 34, cardFace: asset('/assets/pele-card.webp') },
  { id: 32, name: 'J. Cruyff', ovr: 126, pos: 'CF', nation: 'Hà Lan', flag: 'NL', club: 'Ajax', tier: 'eternal', value: 1200000, wage: 33, cardFace: asset('/assets/cruyff-card.webp') },
  { id: 33, name: 'R. Gullit', ovr: 125, pos: 'CF', nation: 'Hà Lan', flag: 'NL', club: 'Milano', tier: 'eternal', value: 2000000, wage: 34, cardFace: asset('/assets/gullit-card.webp') },
  { id: 5, name: 'T. Henry', ovr: 124, pos: 'ST', nation: 'Pháp', flag: 'FR', club: 'Arsenal', tier: 'eternal', value: 850000, wage: 32, cardFace: asset('/assets/henry-card.webp') },
  { id: 34, name: 'Eusébio', ovr: 125, pos: 'ST', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Benfica', tier: 'eternal', value: 900000, wage: 33, cardFace: asset('/assets/eusebio-card.webp') },
  { id: 35, name: 'W. Rooney', ovr: 124, pos: 'ST', nation: 'Anh', flag: 'EN', club: 'Manchester Đỏ', tier: 'eternal', value: 500000, wage: 32, cardFace: asset('/assets/rooney-card.webp') },
  { id: 36, name: 'D. Drogba', ovr: 124, pos: 'ST', nation: 'Bờ Biển Ngà', flag: 'CI', club: 'Chelsea', tier: 'eternal', value: 450000, wage: 33, cardFace: asset('/assets/drogba-card.webp') },
  { id: 37, name: 'Fernando Torres', ovr: 122, pos: 'ST', nation: 'Tây Ban Nha', flag: 'ES', club: 'Liverpool', tier: 'eternal', value: 350000, wage: 32, cardFace: asset('/assets/torres-card.webp') },
  { id: 3, name: 'Z. Zidane', ovr: 126, pos: 'CAM', nation: 'Pháp', flag: 'FR', club: 'Madrid', tier: 'eternal', value: 1100000, wage: 34, cardFace: asset('/assets/zidane-card.webp') },
  { id: 4, name: 'Ronaldinho', ovr: 125, pos: 'LW', nation: 'Brazil', flag: 'BR', club: 'Barcelona', tier: 'eternal', value: 950000, wage: 32, cardFace: asset('/assets/ronaldinho-card.webp') },
  { id: 8, name: 'D. Beckham', ovr: 124, pos: 'RM', nation: 'Anh', flag: 'EN', club: 'Manchester Đỏ', tier: 'eternal', value: 600000, wage: 32, cardFace: asset('/assets/beckham-card.webp') },
  { id: 38, name: 'Kaká', ovr: 124, pos: 'CAM', nation: 'Brazil', flag: 'BR', club: 'Milano', tier: 'eternal', value: 600000, wage: 33, cardFace: asset('/assets/kaka-card.webp') },
  { id: 39, name: 'P. Vieira', ovr: 123, pos: 'CDM', nation: 'Pháp', flag: 'FR', club: 'Arsenal', tier: 'eternal', value: 800000, wage: 32, cardFace: asset('/assets/vieira-card.webp') },
  { id: 40, name: 'M. Ballack', ovr: 123, pos: 'CAM', nation: 'Đức', flag: 'DE', club: 'Chelsea', tier: 'eternal', value: 500000, wage: 32, cardFace: asset('/assets/ballack-card.webp') },
  { id: 41, name: 'S. Gerrard', ovr: 123, pos: 'CAM', nation: 'Anh', flag: 'EN', club: 'Liverpool', tier: 'eternal', value: 400000, wage: 32, cardFace: asset('/assets/gerrard-card.webp') },
  { id: 42, name: 'Park Ji-sung', ovr: 122, pos: 'CAM', nation: 'Hàn Quốc', flag: 'KR', club: 'Manchester Đỏ', tier: 'eternal', value: 300000, wage: 31, cardFace: asset('/assets/park-card.webp') },
  { id: 6, name: 'P. Maldini', ovr: 125, pos: 'LB', nation: 'Ý', flag: 'IT', club: 'Milano', tier: 'eternal', value: 700000, wage: 32, cardFace: asset('/assets/maldini-card.webp') },
  { id: 43, name: 'R. Ferdinand', ovr: 123, pos: 'CB', nation: 'Anh', flag: 'EN', club: 'Manchester Đỏ', tier: 'eternal', value: 480000, wage: 32, cardFace: asset('/assets/ferdinand-card.webp') },
  { id: 44, name: 'N. Vidić', ovr: 122, pos: 'CB', nation: 'Serbia', flag: 'RS', club: 'Manchester Đỏ', tier: 'eternal', value: 300000, wage: 31, cardFace: asset('/assets/vidic-card.webp') },
  { id: 45, name: 'Roberto Carlos', ovr: 124, pos: 'LB', nation: 'Brazil', flag: 'BR', club: 'Madrid', tier: 'eternal', value: 250000, wage: 32, cardFace: asset('/assets/rcarlos-card.webp') },
  { id: 46, name: 'L. Yashin', ovr: 126, pos: 'GK', nation: 'Nga', flag: 'RU', club: 'Dynamo', tier: 'eternal', value: 200000, wage: 29, cardFace: asset('/assets/yashin-card.webp') },
  { id: 47, name: 'E. van der Sar', ovr: 121, pos: 'GK', nation: 'Hà Lan', flag: 'NL', club: 'Manchester Đỏ', tier: 'eternal', value: 280000, wage: 27, cardFace: asset('/assets/vandersar-card.webp') },
  { id: 48, name: 'P. Čech', ovr: 122, pos: 'GK', nation: 'Séc', flag: 'CZ', club: 'Chelsea', tier: 'eternal', value: 250000, wage: 27, cardFace: asset('/assets/cech-card.webp') },
  { id: 49, name: 'D. Maradona', ovr: 127, pos: 'CAM', nation: 'Argentina', flag: 'AR', club: 'Napoli', tier: 'eternal', wage: 33, cardFace: asset('/assets/maradona-card.webp') },
  { id: 50, name: 'M. van Basten', ovr: 126, pos: 'ST', nation: 'Hà Lan', flag: 'NL', club: 'Milano', tier: 'eternal', wage: 34, cardFace: asset('/assets/vanbasten-card.webp') },
  { id: 51, name: 'G. Müller', ovr: 126, pos: 'ST', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'eternal', wage: 34, cardFace: asset('/assets/muller-card.webp') },
  { id: 52, name: 'F. Beckenbauer', ovr: 126, pos: 'CB', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'eternal', wage: 33, cardFace: asset('/assets/beckenbauer-card.webp') },
  { id: 53, name: 'Ferenc Puskás', ovr: 126, pos: 'CF', nation: 'Hungary', flag: 'HU', club: 'Madrid', tier: 'eternal', wage: 32, cardFace: asset('/assets/puskas-card.webp') },
  { id: 54, name: 'G. Best', ovr: 125, pos: 'RW', nation: 'Bắc Ireland', flag: 'NI', club: 'Manchester Đỏ', tier: 'eternal', wage: 33, cardFace: asset('/assets/best-card.webp') },
  { id: 55, name: 'R. Baggio', ovr: 125, pos: 'CF', nation: 'Ý', flag: 'IT', club: 'Torino', tier: 'eternal', wage: 33, cardFace: asset('/assets/baggio-card.webp') },
  { id: 56, name: 'Jairzinho', ovr: 125, pos: 'RW', nation: 'Brazil', flag: 'BR', club: 'Botafogo', tier: 'eternal', wage: 32, cardFace: asset('/assets/jairzinho-card.webp') },
  { id: 57, name: 'Garrincha', ovr: 125, pos: 'RW', nation: 'Brazil', flag: 'BR', club: 'Botafogo', tier: 'eternal', wage: 32, cardFace: asset('/assets/garrincha-card.webp') },
  { id: 58, name: 'B. Charlton', ovr: 125, pos: 'CAM', nation: 'Anh', flag: 'EN', club: 'Manchester Đỏ', tier: 'eternal', wage: 32, cardFace: asset('/assets/charlton-card.webp') },
  { id: 59, name: 'F. Baresi', ovr: 125, pos: 'CB', nation: 'Ý', flag: 'IT', club: 'Milano', tier: 'eternal', wage: 32, cardFace: asset('/assets/baresi-card.webp') },
  { id: 60, name: 'Zico', ovr: 125, pos: 'CAM', nation: 'Brazil', flag: 'BR', club: 'Flamengo', tier: 'eternal', wage: 32, cardFace: asset('/assets/zico-card.webp') },
  { id: 61, name: 'Iniesta', ovr: 125, pos: 'CM', nation: 'Tây Ban Nha', flag: 'ES', club: 'Barcelona', tier: 'eternal', wage: 32, cardFace: asset('/assets/iniesta-card.webp') },
  { id: 62, name: 'Xavi', ovr: 125, pos: 'CM', nation: 'Tây Ban Nha', flag: 'ES', club: 'Barcelona', tier: 'eternal', wage: 31, cardFace: asset('/assets/xavi-card.webp') },
  { id: 63, name: 'G. Buffon', ovr: 125, pos: 'GK', nation: 'Ý', flag: 'IT', club: 'Torino', tier: 'eternal', wage: 29, cardFace: asset('/assets/buffon-card.webp') },
  { id: 64, name: 'E. Cantona', ovr: 124, pos: 'CF', nation: 'Pháp', flag: 'FR', club: 'Manchester Đỏ', tier: 'eternal', wage: 33, cardFace: asset('/assets/cantona-card.webp') },
  { id: 65, name: 'Z. Ibrahimović', ovr: 124, pos: 'ST', nation: 'Thụy Điển', flag: 'SE', club: 'Milano', tier: 'eternal', wage: 33, cardFace: asset('/assets/ibrahimovic-card.webp') },
  { id: 66, name: 'A. Shevchenko', ovr: 124, pos: 'ST', nation: 'Ukraine', flag: 'UA', club: 'Milano', tier: 'eternal', wage: 33, cardFace: asset('/assets/shevchenko-card.webp') },
  { id: 67, name: 'F. Totti', ovr: 124, pos: 'CF', nation: 'Ý', flag: 'IT', club: 'Roma', tier: 'eternal', wage: 33, cardFace: asset('/assets/totti-card.webp') },
  { id: 68, name: 'Gabriel Batistuta', ovr: 124, pos: 'ST', nation: 'Argentina', flag: 'AR', club: 'Fiorentina', tier: 'eternal', wage: 32, cardFace: asset('/assets/batistuta-card.webp') },
  { id: 9, name: 'A. Pirlo', ovr: 124, pos: 'CM', nation: 'Ý', flag: 'IT', club: 'Milano', tier: 'eternal', wage: 32, cardFace: asset('/assets/pirlo-card.webp') },
  { id: 10, name: 'Casillas', ovr: 124, pos: 'GK', nation: 'Tây Ban Nha', flag: 'ES', club: 'Madrid', tier: 'eternal', wage: 27, cardFace: asset('/assets/casillas-card.webp') },
  { id: 69, name: 'F. Rijkaard', ovr: 124, pos: 'CDM', nation: 'Hà Lan', flag: 'NL', club: 'Milano', tier: 'eternal', wage: 32, cardFace: asset('/assets/rijkaard-card.webp') },
  { id: 70, name: 'H. Sánchez', ovr: 124, pos: 'ST', nation: 'Mexico', flag: 'MX', club: 'Madrid', tier: 'eternal', wage: 32, cardFace: asset('/assets/sanchez-card.webp') },
  { id: 71, name: 'R. van Nistelrooy', ovr: 124, pos: 'ST', nation: 'Hà Lan', flag: 'NL', club: 'Manchester Đỏ', tier: 'eternal', wage: 32, cardFace: asset('/assets/nistelrooy-card.webp') },
  { id: 72, name: 'S. Eto\'o', ovr: 124, pos: 'ST', nation: 'Cameroon', flag: 'CM', club: 'Barcelona', tier: 'eternal', wage: 32, cardFace: asset('/assets/etoo-card.webp') },
  { id: 73, name: 'Luís Figo', ovr: 124, pos: 'RW', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Madrid', tier: 'eternal', wage: 32, cardFace: asset('/assets/figo-card.webp') },
  { id: 74, name: 'Rivaldo', ovr: 124, pos: 'CAM', nation: 'Brazil', flag: 'BR', club: 'Barcelona', tier: 'eternal', wage: 32, cardFace: asset('/assets/rivaldo-card.webp') },
  { id: 75, name: 'D. Bergkamp', ovr: 124, pos: 'CF', nation: 'Hà Lan', flag: 'NL', club: 'Arsenal', tier: 'eternal', wage: 32, cardFace: asset('/assets/bergkamp-card.webp') },
  { id: 76, name: 'A. Nesta', ovr: 124, pos: 'CB', nation: 'Ý', flag: 'IT', club: 'Milano', tier: 'eternal', wage: 32, cardFace: asset('/assets/nesta-card.webp') },
  { id: 77, name: 'A. Shearer', ovr: 124, pos: 'ST', nation: 'Anh', flag: 'EN', club: 'Newcastle', tier: 'eternal', wage: 32, cardFace: asset('/assets/shearer-card.webp') },
  { id: 78, name: 'Cafu', ovr: 124, pos: 'RB', nation: 'Brazil', flag: 'BR', club: 'Milano', tier: 'eternal', wage: 31, cardFace: asset('/assets/cafu-card.webp') },
  { id: 79, name: 'F. Cannavaro', ovr: 124, pos: 'CB', nation: 'Ý', flag: 'IT', club: 'Madrid', tier: 'eternal', wage: 31, cardFace: asset('/assets/cannavaro-card.webp') },
  { id: 80, name: 'O. Kahn', ovr: 124, pos: 'GK', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'eternal', wage: 28, cardFace: asset('/assets/kahn-card.webp') },
  { id: 81, name: 'K. Dalglish', ovr: 123, pos: 'CF', nation: 'Scotland', flag: 'SC', club: 'Liverpool', tier: 'eternal', wage: 32, cardFace: asset('/assets/dalglish-card.webp') },
  { id: 82, name: 'Dunga', ovr: 123, pos: 'CDM', nation: 'Brazil', flag: 'BR', club: 'Fiorentina', tier: 'eternal', wage: 32, cardFace: asset('/assets/dunga-card.webp') },
  { id: 83, name: 'B. Cha', ovr: 123, pos: 'ST', nation: 'Hàn Quốc', flag: 'KR', club: 'Leverkusen', tier: 'eternal', wage: 32, cardFace: asset('/assets/bcha-card.webp') },
  { id: 84, name: 'T. Kroos', ovr: 123, pos: 'CM', nation: 'Đức', flag: 'DE', club: 'Madrid', tier: 'eternal', wage: 32, cardFace: asset('/assets/kroos-card.webp') },
  { id: 85, name: 'Marcelo', ovr: 123, pos: 'LB', nation: 'Brazil', flag: 'BR', club: 'Madrid', tier: 'eternal', wage: 32, cardFace: asset('/assets/marcelo-card.webp') },
  { id: 86, name: 'M. Klose', ovr: 123, pos: 'ST', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'eternal', wage: 32, cardFace: asset('/assets/klose-card.webp') },
  { id: 87, name: 'R. van Persie', ovr: 123, pos: 'ST', nation: 'Hà Lan', flag: 'NL', club: 'Arsenal', tier: 'eternal', wage: 32, cardFace: asset('/assets/vanpersie-card.webp') },
  { id: 88, name: 'P. Nedvěd', ovr: 123, pos: 'CAM', nation: 'Séc', flag: 'CZ', club: 'Torino', tier: 'eternal', wage: 32, cardFace: asset('/assets/nedved-card.webp') },
  { id: 89, name: 'F. Lampard', ovr: 123, pos: 'CM', nation: 'Anh', flag: 'EN', club: 'Chelsea', tier: 'eternal', wage: 32, cardFace: asset('/assets/lampard-card.webp') },
  { id: 90, name: 'A. Del Piero', ovr: 123, pos: 'CF', nation: 'Ý', flag: 'IT', club: 'Torino', tier: 'eternal', wage: 32, cardFace: asset('/assets/delpiero-card.webp') },
  { id: 91, name: 'I. Rush', ovr: 123, pos: 'ST', nation: 'Wales', flag: 'WL', club: 'Liverpool', tier: 'eternal', wage: 31, cardFace: asset('/assets/rush-card.webp') },
  { id: 92, name: 'B. Moore', ovr: 123, pos: 'CB', nation: 'Anh', flag: 'EN', club: 'West Ham', tier: 'eternal', wage: 31, cardFace: asset('/assets/moore-card.webp') },
  { id: 93, name: 'R. Koeman', ovr: 123, pos: 'CB', nation: 'Hà Lan', flag: 'NL', club: 'Barcelona', tier: 'eternal', wage: 31, cardFace: asset('/assets/koeman-card.webp') },
  { id: 94, name: 'Carlos Alberto', ovr: 123, pos: 'RB', nation: 'Brazil', flag: 'BR', club: 'Santos', tier: 'eternal', wage: 31, cardFace: asset('/assets/carlosalberto-card.webp') },
  { id: 95, name: 'P. Lahm', ovr: 123, pos: 'RB', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'eternal', wage: 31, cardFace: asset('/assets/lahm-card.webp') },
  { id: 96, name: 'Raúl', ovr: 123, pos: 'CF', nation: 'Tây Ban Nha', flag: 'ES', club: 'Madrid', tier: 'eternal', wage: 31, cardFace: asset('/assets/raul-card.webp') },
  { id: 97, name: 'Xabi Alonso', ovr: 123, pos: 'CM', nation: 'Tây Ban Nha', flag: 'ES', club: 'Liverpool', tier: 'eternal', wage: 31, cardFace: asset('/assets/xabialonso-card.webp') },
  { id: 98, name: 'C. Puyol', ovr: 123, pos: 'CB', nation: 'Tây Ban Nha', flag: 'ES', club: 'Barcelona', tier: 'eternal', wage: 31, cardFace: asset('/assets/puyol-card.webp') },
  { id: 99, name: 'M. Owen', ovr: 123, pos: 'ST', nation: 'Anh', flag: 'EN', club: 'Liverpool', tier: 'eternal', wage: 31, cardFace: asset('/assets/owen-card.webp') },
  { id: 100, name: 'L. Thuram', ovr: 123, pos: 'RB', nation: 'Pháp', flag: 'FR', club: 'Torino', tier: 'eternal', wage: 31, cardFace: asset('/assets/thuram-card.webp') },
  { id: 101, name: 'J. Zanetti', ovr: 123, pos: 'LB', nation: 'Argentina', flag: 'AR', club: 'Milano', tier: 'eternal', wage: 31, cardFace: asset('/assets/zanetti-card.webp') },
  { id: 102, name: 'P. Scholes', ovr: 123, pos: 'CM', nation: 'Anh', flag: 'EN', club: 'Manchester Đỏ', tier: 'eternal', wage: 31, cardFace: asset('/assets/scholes-card.webp') },
  { id: 103, name: 'P. Schmeichel', ovr: 123, pos: 'GK', nation: 'Đan Mạch', flag: 'DK', club: 'Manchester Đỏ', tier: 'eternal', wage: 28, cardFace: asset('/assets/schmeichel-card.webp') },
  { id: 104, name: 'Y. Touré', ovr: 122, pos: 'CM', nation: 'Bờ Biển Ngà', flag: 'CI', club: 'Manchester Xanh', tier: 'eternal', wage: 32, cardFace: asset('/assets/toure-card.webp') },
  { id: 105, name: 'M. Laudrup', ovr: 122, pos: 'CF', nation: 'Đan Mạch', flag: 'DK', club: 'Barcelona', tier: 'eternal', wage: 31, cardFace: asset('/assets/laudrup-card.webp') },
  { id: 106, name: 'G. Lineker', ovr: 122, pos: 'ST', nation: 'Anh', flag: 'EN', club: 'Tottenham', tier: 'eternal', wage: 31, cardFace: asset('/assets/lineker-card.webp') },
  { id: 107, name: 'Butragueño', ovr: 122, pos: 'ST', nation: 'Tây Ban Nha', flag: 'ES', club: 'Madrid', tier: 'eternal', wage: 31, cardFace: asset('/assets/butragueno-card.webp') },
  { id: 108, name: 'G. Bale', ovr: 122, pos: 'LM', nation: 'Wales', flag: 'WL', club: 'Madrid', tier: 'eternal', wage: 31, cardFace: asset('/assets/bale-card.webp') },
  { id: 109, name: 'G. Hagi', ovr: 122, pos: 'CAM', nation: 'Romania', flag: 'RO', club: 'Galatasaray', tier: 'eternal', wage: 31, cardFace: asset('/assets/hagi-card.webp') },
  { id: 110, name: 'F. Ribéry', ovr: 122, pos: 'LW', nation: 'Pháp', flag: 'FR', club: 'Bayern', tier: 'eternal', wage: 31, cardFace: asset('/assets/ribery-card.webp') },
  { id: 111, name: 'G. Chiellini', ovr: 122, pos: 'CB', nation: 'Ý', flag: 'IT', club: 'Torino', tier: 'eternal', wage: 31, cardFace: asset('/assets/chiellini-card.webp') },
  { id: 112, name: 'H. Crespo', ovr: 122, pos: 'ST', nation: 'Argentina', flag: 'AR', club: 'Milano', tier: 'eternal', wage: 31, cardFace: asset('/assets/crespo-card.webp') },
  { id: 113, name: 'D. Trezeguet', ovr: 122, pos: 'ST', nation: 'Pháp', flag: 'FR', club: 'Torino', tier: 'eternal', wage: 31, cardFace: asset('/assets/trezeguet-card.webp') },
  { id: 114, name: 'H. Stoichkov', ovr: 122, pos: 'RW', nation: 'Bulgaria', flag: 'BG', club: 'Barcelona', tier: 'eternal', wage: 31, cardFace: asset('/assets/stoichkov-card.webp') },
  { id: 115, name: 'C. Seedorf', ovr: 122, pos: 'CAM', nation: 'Hà Lan', flag: 'NL', club: 'Milano', tier: 'eternal', wage: 31, cardFace: asset('/assets/seedorf-card.webp') },
  { id: 116, name: 'M. Desailly', ovr: 122, pos: 'CDM', nation: 'Pháp', flag: 'FR', club: 'Chelsea', tier: 'eternal', wage: 31, cardFace: asset('/assets/desailly-card.webp') },
  { id: 117, name: 'L. Blanc', ovr: 122, pos: 'CB', nation: 'Pháp', flag: 'FR', club: 'Manchester Đỏ', tier: 'eternal', wage: 30, cardFace: asset('/assets/blanc-card.webp') },
  { id: 118, name: 'Fernando Hierro', ovr: 122, pos: 'CB', nation: 'Tây Ban Nha', flag: 'ES', club: 'Madrid', tier: 'eternal', wage: 30, cardFace: asset('/assets/hierro-card.webp') },
  { id: 119, name: 'B. Schweinsteiger', ovr: 122, pos: 'CM', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'eternal', wage: 30, cardFace: asset('/assets/schweinsteiger-card.webp') },
  { id: 120, name: 'C. Makélélé', ovr: 122, pos: 'CDM', nation: 'Pháp', flag: 'FR', club: 'Chelsea', tier: 'eternal', wage: 30, cardFace: asset('/assets/makelele-card.webp') },
  { id: 121, name: 'R. Keane', ovr: 122, pos: 'CDM', nation: 'Ireland', flag: 'IE', club: 'Manchester Đỏ', tier: 'eternal', wage: 30, cardFace: asset('/assets/keane-card.webp') },
  { id: 122, name: 'Rui Costa', ovr: 121, pos: 'CAM', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Milano', tier: 'eternal', wage: 30, cardFace: asset('/assets/ruicosta-card.webp') },
  { id: 236, name: 'L. Matthäus', ovr: 126, pos: 'CM', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'eternal', wage: 33, cardFace: asset('/assets/matthaus-card.webp') },
  { id: 237, name: 'A. Cole', ovr: 121, pos: 'LB', nation: 'Anh', flag: 'EN', club: 'Arsenal', tier: 'eternal', wage: 30, cardFace: asset('/assets/cole-card.webp') },
  { id: 238, name: 'E. Petit', ovr: 121, pos: 'CDM', nation: 'Pháp', flag: 'FR', club: 'Arsenal', tier: 'eternal', wage: 30, cardFace: asset('/assets/petit-card.webp') },
  { id: 239, name: 'G. Gattuso', ovr: 121, pos: 'CDM', nation: 'Ý', flag: 'IT', club: 'Milano', tier: 'eternal', wage: 30, cardFace: asset('/assets/gattuso-card.webp') },
  { id: 240, name: 'G. Zambrotta', ovr: 121, pos: 'RB', nation: 'Ý', flag: 'IT', club: 'Milano', tier: 'eternal', wage: 30, cardFace: asset('/assets/zambrotta-card.webp') },
  { id: 241, name: 'Verón', ovr: 121, pos: 'CM', nation: 'Argentina', flag: 'AR', club: 'Lazio', tier: 'eternal', wage: 30, cardFace: asset('/assets/veron-card.webp') },
  { id: 242, name: 'M. Essien', ovr: 121, pos: 'CDM', nation: 'Ghana', flag: 'GH', club: 'Chelsea', tier: 'eternal', wage: 30, cardFace: asset('/assets/essien-card.webp') },
  { id: 243, name: 'H. Larsson', ovr: 121, pos: 'ST', nation: 'Thụy Điển', flag: 'SE', club: 'Barcelona', tier: 'eternal', wage: 30, cardFace: asset('/assets/larsson-card.webp') },
  { id: 244, name: 'I. Wright', ovr: 121, pos: 'ST', nation: 'Anh', flag: 'EN', club: 'Arsenal', tier: 'eternal', wage: 30, cardFace: asset('/assets/iwright-card.webp') },
  { id: 245, name: 'P. Kluivert', ovr: 121, pos: 'ST', nation: 'Hà Lan', flag: 'NL', club: 'Barcelona', tier: 'eternal', wage: 30, cardFace: asset('/assets/kluivert-card.webp') },
  { id: 246, name: 'Sócrates', ovr: 121, pos: 'CAM', nation: 'Brazil', flag: 'BR', club: 'Corinthians', tier: 'eternal', wage: 30, cardFace: asset('/assets/socrates-card.webp') },
  { id: 247, name: 'H. Nakata', ovr: 117, pos: 'CAM', nation: 'Nhật Bản', flag: 'JP', club: 'Parma', tier: 'eternal', wage: 29, cardFace: asset('/assets/nakata-card.webp') },
  { id: 248, name: 'L. Hernández', ovr: 119, pos: 'ST', nation: 'Mexico', flag: 'MX', club: 'Necaxa', tier: 'eternal', wage: 29, cardFace: asset('/assets/hernandez-card.webp') },
  { id: 249, name: 'O. Bierhoff', ovr: 119, pos: 'ST', nation: 'Đức', flag: 'DE', club: 'Milano', tier: 'eternal', wage: 29, cardFace: asset('/assets/bierhoff-card.webp') },
  { id: 250, name: 'O. Solskjaer', ovr: 119, pos: 'ST', nation: 'Na Uy', flag: 'NO', club: 'Manchester Đỏ', tier: 'eternal', wage: 30, cardFace: asset('/assets/solskjaer-card.webp') },
  { id: 251, name: 'J. Carragher', ovr: 119, pos: 'CB', nation: 'Anh', flag: 'EN', club: 'Liverpool', tier: 'eternal', wage: 30, cardFace: asset('/assets/carragher-card.webp') },
  { id: 252, name: 'D. Šuker', ovr: 119, pos: 'ST', nation: 'Croatia', flag: 'HR', club: 'Sevilla', tier: 'eternal', wage: 30, cardFace: asset('/assets/suker-card.webp') },
  { id: 253, name: 'J. Barnes', ovr: 119, pos: 'LW', nation: 'Anh', flag: 'EN', club: 'Liverpool', tier: 'eternal', wage: 30, cardFace: asset('/assets/barnes-card.webp') },
  { id: 254, name: 'Riquelme', ovr: 120, pos: 'CAM', nation: 'Argentina', flag: 'AR', club: 'Boca Juniors', tier: 'eternal', wage: 29, cardFace: asset('/assets/riquelme-card.webp') },
  { id: 255, name: 'G. Zola', ovr: 120, pos: 'CF', nation: 'Ý', flag: 'IT', club: 'Chelsea', tier: 'eternal', wage: 30, cardFace: asset('/assets/zola-card.webp') },
  { id: 256, name: 'R. Pirès', ovr: 120, pos: 'LM', nation: 'Pháp', flag: 'FR', club: 'Arsenal', tier: 'eternal', wage: 30, cardFace: asset('/assets/pires-card.webp') },
  { id: 257, name: 'J. Litmanen', ovr: 120, pos: 'CAM', nation: 'Phần Lan', flag: 'FI', club: 'Ajax', tier: 'eternal', wage: 30, cardFace: asset('/assets/litmanen-card.webp') },
  { id: 258, name: 'F. Ljungberg', ovr: 120, pos: 'RM', nation: 'Thụy Điển', flag: 'SE', club: 'Arsenal', tier: 'eternal', wage: 30, cardFace: asset('/assets/ljungberg-card.webp') },
  { id: 259, name: 'Paulo Futre', ovr: 120, pos: 'CAM', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Atlético', tier: 'eternal', wage: 30, cardFace: asset('/assets/futre-card.webp') },
  { id: 260, name: 'S. Campbell', ovr: 120, pos: 'CB', nation: 'Anh', flag: 'EN', club: 'Arsenal', tier: 'eternal', wage: 31, cardFace: asset('/assets/campbell-card.webp') },
  { id: 261, name: 'J. Okocha', ovr: 119, pos: 'CAM', nation: 'Nigeria', flag: 'NG', club: 'Paris', tier: 'eternal', wage: 29, cardFace: asset('/assets/okocha-card.webp') },
  { id: 13, name: 'H. Kane', ovr: 126, pos: 'ST', nation: 'Anh', flag: 'EN', club: 'Bayern', tier: 'stellar', wage: 34, cardFace: asset('/assets/ts-kane-card.webp') },
  { id: 11, name: 'K. Mbappé', ovr: 126, pos: 'ST', nation: 'Pháp', flag: 'FR', club: 'Madrid', tier: 'stellar', wage: 33, cardFace: asset('/assets/ts-mbappe-card.webp') },
  { id: 14, name: 'Lamine Yamal', ovr: 126, pos: 'RW', nation: 'Tây Ban Nha', flag: 'ES', club: 'Barcelona', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-yamal-card.webp') },
  { id: 15, name: 'M. Olise', ovr: 126, pos: 'RW', nation: 'Pháp', flag: 'FR', club: 'Bayern', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-olise-card.webp') },
  { id: 12, name: 'E. Haaland', ovr: 125, pos: 'ST', nation: 'Na Uy', flag: 'NO', club: 'Manchester Xanh', tier: 'stellar', wage: 33, cardFace: asset('/assets/ts-haaland-card.webp') },
  { id: 16, name: 'Bruno Fernandes', ovr: 125, pos: 'CAM', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Manchester Đỏ', tier: 'stellar', wage: 33, cardFace: asset('/assets/ts-bruno-card.webp') },
  { id: 17, name: 'Vitinha', ovr: 125, pos: 'CM', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Paris', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-vitinha-card.webp') },
  { id: 18, name: 'Pedri', ovr: 125, pos: 'CM', nation: 'Tây Ban Nha', flag: 'ES', club: 'Barcelona', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-pedri-card.webp') },
  { id: 123, name: 'L. Díaz', ovr: 125, pos: 'LW', nation: 'Colombia', flag: 'CO', club: 'Bayern', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-diaz-card.webp') },
  { id: 20, name: 'D. Rice', ovr: 125, pos: 'CM', nation: 'Anh', flag: 'EN', club: 'Arsenal', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-rice-card.webp') },
  { id: 124, name: 'Gabriel', ovr: 125, pos: 'CB', nation: 'Brazil', flag: 'BR', club: 'Arsenal', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-gabriel-card.webp') },
  { id: 19, name: 'L. Modrić', ovr: 124, pos: 'CM', nation: 'Croatia', flag: 'HR', club: 'Milano', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-modric-card.webp') },
  { id: 125, name: 'Nico Paz', ovr: 124, pos: 'CAM', nation: 'Argentina', flag: 'AR', club: 'Como', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-nicopaz-card.webp') },
  { id: 126, name: 'Igor Thiago', ovr: 124, pos: 'ST', nation: 'Brazil', flag: 'BR', club: 'Brentford', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-igorthiago-card.webp') },
  { id: 127, name: 'W. Saliba', ovr: 124, pos: 'CB', nation: 'Pháp', flag: 'FR', club: 'Arsenal', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-saliba-card.webp') },
  { id: 128, name: 'F. Dimarco', ovr: 124, pos: 'LWB', nation: 'Ý', flag: 'IT', club: 'Inter', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-dimarco-card.webp') },
  { id: 129, name: 'L. Messi', ovr: 123, pos: 'CF', nation: 'Argentina', flag: 'AR', club: 'Inter Miami', tier: 'stellar', wage: 33, cardFace: asset('/assets/ts-messi-card.webp') },
  { id: 130, name: 'Cristiano Ronaldo', ovr: 123, pos: 'ST', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Al Nassr', tier: 'stellar', wage: 33, cardFace: asset('/assets/ts-cr7-card.webp') },
  { id: 131, name: 'K. Yıldız', ovr: 123, pos: 'LW', nation: 'Thổ Nhĩ Kỳ', flag: 'TR', club: 'Torino', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-yildiz-card.webp') },
  { id: 132, name: 'L. Suárez', ovr: 123, pos: 'ST', nation: 'Colombia', flag: 'CO', club: 'Sporting', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-suarez-card.webp') },
  { id: 133, name: 'F. Valverde', ovr: 123, pos: 'RM', nation: 'Uruguay', flag: 'UY', club: 'Madrid', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-valverde-card.webp') },
  { id: 134, name: 'L. Martínez', ovr: 123, pos: 'ST', nation: 'Argentina', flag: 'AR', club: 'Inter', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-lautaro-card.webp') },
  { id: 135, name: 'Marcos Llorente', ovr: 123, pos: 'RB', nation: 'Tây Ban Nha', flag: 'ES', club: 'Atlético', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-llorente-card.webp') },
  { id: 136, name: 'V. Muriqi', ovr: 123, pos: 'ST', nation: 'Kosovo', flag: 'XK', club: 'Mallorca', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-muriqi-card.webp') },
  { id: 137, name: 'J. Kimmich', ovr: 123, pos: 'CDM', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-kimmich-card.webp') },
  { id: 138, name: 'V. van Dijk', ovr: 123, pos: 'CB', nation: 'Hà Lan', flag: 'NL', club: 'Liverpool', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-vandijk-card.webp') },
  { id: 139, name: 'J. Veerman', ovr: 123, pos: 'CM', nation: 'Hà Lan', flag: 'NL', club: 'PSV', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-veerman-card.webp') },
  { id: 140, name: 'Nuno Mendes', ovr: 123, pos: 'LB', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Paris', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-nunomendes-card.webp') },
  { id: 141, name: 'João Pedro', ovr: 123, pos: 'ST', nation: 'Brazil', flag: 'BR', club: 'Chelsea', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-joaopedro-card.webp') },
  { id: 142, name: 'Bruno Guimarães', ovr: 123, pos: 'CM', nation: 'Brazil', flag: 'BR', club: 'Newcastle', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-guimaraes-card.webp') },
  { id: 143, name: 'N. Schlotterbeck', ovr: 123, pos: 'CB', nation: 'Đức', flag: 'DE', club: 'Dortmund', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-schlotterbeck-card.webp') },
  { id: 144, name: 'K. Kvaratskhelia', ovr: 123, pos: 'LW', nation: 'Georgia', flag: 'GE', club: 'Paris', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-kvara-card.webp') },
  { id: 145, name: 'A. Semenyo', ovr: 123, pos: 'RW', nation: 'Ghana', flag: 'GH', club: 'Manchester Xanh', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-semenyo-card.webp') },
  { id: 146, name: 'D. Szoboszlai', ovr: 123, pos: 'CAM', nation: 'Hungary', flag: 'HU', club: 'Liverpool', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-szoboszlai-card.webp') },
  { id: 147, name: 'D. Raum', ovr: 123, pos: 'LB', nation: 'Đức', flag: 'DE', club: 'Leipzig', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-raum-card.webp') },
  { id: 148, name: 'O. Dembélé', ovr: 123, pos: 'ST', nation: 'Pháp', flag: 'FR', club: 'Paris', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-dembele-card.webp') },
  { id: 149, name: 'Jacobo Ramón', ovr: 123, pos: 'CB', nation: 'Tây Ban Nha', flag: 'ES', club: 'Como', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-jacoboramon-card.webp') },
  { id: 150, name: 'L. Vušković', ovr: 123, pos: 'CB', nation: 'Croatia', flag: 'HR', club: 'Hamburg', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-vuskovic-card.webp') },
  { id: 151, name: 'David Raya', ovr: 123, pos: 'GK', nation: 'Tây Ban Nha', flag: 'ES', club: 'Arsenal', tier: 'stellar', wage: 28, cardFace: asset('/assets/ts-raya-card.webp') },
  { id: 152, name: 'M. Godts', ovr: 122, pos: 'LW', nation: 'Bỉ', flag: 'BE', club: 'Ajax', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-godts-card.webp') },
  { id: 153, name: 'J. Alvarez', ovr: 122, pos: 'CF', nation: 'Argentina', flag: 'AR', club: 'Atlético', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-alvarez-card.webp') },
  { id: 154, name: 'D. Undav', ovr: 122, pos: 'ST', nation: 'Đức', flag: 'DE', club: 'Stuttgart', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-undav-card.webp') },
  { id: 155, name: 'S. Gnabry', ovr: 122, pos: 'CF', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-gnabry-card.webp') },
  { id: 156, name: 'G. Xhaka', ovr: 122, pos: 'CDM', nation: 'Thụy Sĩ', flag: 'CH', club: 'Sunderland', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-xhaka-card.webp') },
  { id: 157, name: 'Carlos Romero', ovr: 121, pos: 'LB', nation: 'Tây Ban Nha', flag: 'ES', club: 'Espanyol', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-carlosromero-card.webp') },
  { id: 158, name: 'I. Saibari', ovr: 122, pos: 'CAM', nation: 'Ma-rốc', flag: 'MA', club: 'PSV', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-saibari-card.webp') },
  { id: 159, name: 'J. Timber', ovr: 122, pos: 'RB', nation: 'Hà Lan', flag: 'NL', club: 'Arsenal', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-timber-card.webp') },
  { id: 160, name: 'R. Cherki', ovr: 122, pos: 'RW', nation: 'Pháp', flag: 'FR', club: 'Manchester Xanh', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-cherki-card.webp') },
  { id: 161, name: 'E. Fernández', ovr: 122, pos: 'CM', nation: 'Argentina', flag: 'AR', club: 'Chelsea', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-enzo-card.webp') },
  { id: 162, name: 'Eric García', ovr: 122, pos: 'CB', nation: 'Tây Ban Nha', flag: 'ES', club: 'Barcelona', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-ericgarcia-card.webp') },
  { id: 163, name: 'João Félix', ovr: 122, pos: 'CF', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Al Nassr', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-felix-card.webp') },
  { id: 164, name: 'A. Tchouaméni', ovr: 122, pos: 'CDM', nation: 'Pháp', flag: 'FR', club: 'Madrid', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-tchouameni-card.webp') },
  { id: 165, name: 'Bremer', ovr: 122, pos: 'CB', nation: 'Brazil', flag: 'BR', club: 'Torino', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-bremer-card.webp') },
  { id: 166, name: 'S. McTominay', ovr: 122, pos: 'CM', nation: 'Scotland', flag: 'SC', club: 'Napoli', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-mctominay-card.webp') },
  { id: 167, name: 'Oyarzabal', ovr: 122, pos: 'CF', nation: 'Tây Ban Nha', flag: 'ES', club: 'Real Sociedad', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-oyarzabal-card.webp') },
  { id: 168, name: 'M. Locatelli', ovr: 122, pos: 'CDM', nation: 'Ý', flag: 'IT', club: 'Torino', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-locatelli-card.webp') },
  { id: 169, name: 'J. Tah', ovr: 122, pos: 'CB', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-tah-card.webp') },
  { id: 170, name: 'A. Rabiot', ovr: 122, pos: 'CM', nation: 'Pháp', flag: 'FR', club: 'Milano', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-rabiot-card.webp') },
  { id: 171, name: 'Casemiro', ovr: 122, pos: 'CDM', nation: 'Brazil', flag: 'BR', club: 'Manchester Đỏ', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-casemiro-card.webp') },
  { id: 172, name: 'N. O\'Reilly', ovr: 122, pos: 'LB', nation: 'Anh', flag: 'EN', club: 'Manchester Xanh', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-oreilly-card.webp') },
  { id: 173, name: 'S. Mouriño', ovr: 122, pos: 'RB', nation: 'Uruguay', flag: 'UY', club: 'Villarreal', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-mourino-card.webp') },
  { id: 174, name: 'A. Pavlović', ovr: 122, pos: 'CDM', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-pavlovic-card.webp') },
  { id: 175, name: 'M. Sangaré', ovr: 122, pos: 'CM', nation: 'Mali', flag: 'ML', club: 'Lens', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-sangare-card.webp') },
  { id: 176, name: 'R. James', ovr: 122, pos: 'RB', nation: 'Anh', flag: 'EN', club: 'Chelsea', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-james-card.webp') },
  { id: 177, name: 'M. Sarr', ovr: 122, pos: 'CB', nation: 'Pháp', flag: 'FR', club: 'Lens', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-sarr-card.webp') },
  { id: 178, name: 'Raphinha', ovr: 122, pos: 'LW', nation: 'Brazil', flag: 'BR', club: 'Barcelona', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-raphinha-card.webp') },
  { id: 179, name: 'D. Upamecano', ovr: 122, pos: 'CB', nation: 'Pháp', flag: 'FR', club: 'Bayern', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-upamecano-card.webp') },
  { id: 180, name: 'Grimaldo', ovr: 122, pos: 'LM', nation: 'Tây Ban Nha', flag: 'ES', club: 'Leverkusen', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-grimaldo-card.webp') },
  { id: 181, name: 'F. Thauvin', ovr: 122, pos: 'RW', nation: 'Pháp', flag: 'FR', club: 'Lens', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-thauvin-card.webp') },
  { id: 182, name: 'Joan García', ovr: 122, pos: 'GK', nation: 'Tây Ban Nha', flag: 'ES', club: 'Barcelona', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-joangarcia-card.webp') },
  { id: 183, name: 'Mauro Júnior', ovr: 122, pos: 'LB', nation: 'Brazil', flag: 'BR', club: 'PSV', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-maurojunior-card.webp') },
  { id: 184, name: 'G. Donnarumma', ovr: 122, pos: 'GK', nation: 'Ý', flag: 'IT', club: 'Manchester Xanh', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-donnarumma-card.webp') },
  { id: 185, name: 'M. Udol', ovr: 122, pos: 'LWB', nation: 'Pháp', flag: 'FR', club: 'Lens', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-udol-card.webp') },
  { id: 186, name: 'T. Courtois', ovr: 122, pos: 'GK', nation: 'Bỉ', flag: 'BE', club: 'Madrid', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-courtois-card.webp') },
  { id: 187, name: 'I. Toney', ovr: 121, pos: 'ST', nation: 'Anh', flag: 'EN', club: 'Al Ahli', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-toney-card.webp') },
  { id: 188, name: 'H. Son', ovr: 121, pos: 'CF', nation: 'Hàn Quốc', flag: 'KR', club: 'LAFC', tier: 'stellar', wage: 32, cardFace: asset('/assets/ts-son-card.webp') },
  { id: 189, name: 'Luis Milla', ovr: 121, pos: 'CM', nation: 'Tây Ban Nha', flag: 'ES', club: 'Getafe', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-milla-card.webp') },
  { id: 190, name: 'W. McKennie', ovr: 121, pos: 'RM', nation: 'Mỹ', flag: 'US', club: 'Torino', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-mckennie-card.webp') },
  { id: 191, name: 'J. Quiñones', ovr: 121, pos: 'ST', nation: 'Mexico', flag: 'MX', club: 'Al Qadsiah', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-quinones-card.webp') },
  { id: 192, name: 'Aleix García', ovr: 121, pos: 'CM', nation: 'Tây Ban Nha', flag: 'ES', club: 'Leverkusen', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-aleixgarcia-card.webp') },
  { id: 193, name: 'D. Bouanga', ovr: 121, pos: 'LW', nation: 'Gabon', flag: 'GA', club: 'LAFC', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-bouanga-card.webp') },
  { id: 194, name: 'Rúben Neves', ovr: 121, pos: 'CDM', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Al Hilal', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-neves-card.webp') },
  { id: 195, name: 'J. Bednarek', ovr: 121, pos: 'CB', nation: 'Ba Lan', flag: 'PL', club: 'Porto', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-bednarek-card.webp') },
  { id: 196, name: 'S. Guirassy', ovr: 121, pos: 'ST', nation: 'Guinea', flag: 'GN', club: 'Dortmund', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-guirassy-card.webp') },
  { id: 197, name: 'P. Zieliński', ovr: 121, pos: 'CM', nation: 'Ba Lan', flag: 'PL', club: 'Inter', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-zielinski-card.webp') },
  { id: 198, name: 'Marc Cucurella', ovr: 121, pos: 'LB', nation: 'Tây Ban Nha', flag: 'ES', club: 'Chelsea', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-cucurella-card.webp') },
  { id: 199, name: 'E. Ndicka', ovr: 121, pos: 'CB', nation: 'Bờ Biển Ngà', flag: 'CI', club: 'Roma', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-ndicka-card.webp') },
  { id: 200, name: 'J. Ryerson', ovr: 121, pos: 'RWB', nation: 'Na Uy', flag: 'NO', club: 'Dortmund', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-ryerson-card.webp') },
  { id: 201, name: 'M. Akanji', ovr: 121, pos: 'CB', nation: 'Thụy Sĩ', flag: 'CH', club: 'Inter', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-akanji-card.webp') },
  { id: 202, name: 'Pablo Fornals', ovr: 121, pos: 'CAM', nation: 'Tây Ban Nha', flag: 'ES', club: 'Real Betis', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-fornals-card.webp') },
  { id: 203, name: 'V. Rongier', ovr: 121, pos: 'CM', nation: 'Pháp', flag: 'FR', club: 'Rennes', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-rongier-card.webp') },
  { id: 204, name: 'H. Wilson', ovr: 121, pos: 'RW', nation: 'Wales', flag: 'WL', club: 'Fulham', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-wilson-card.webp') },
  { id: 205, name: 'C. Tolisso', ovr: 121, pos: 'CAM', nation: 'Pháp', flag: 'FR', club: 'Lyon', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-tolisso-card.webp') },
  { id: 206, name: 'A. Thomasson', ovr: 121, pos: 'CM', nation: 'Pháp', flag: 'FR', club: 'Lens', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-thomasson-card.webp') },
  { id: 207, name: 'Wesley', ovr: 121, pos: 'LWB', nation: 'Brazil', flag: 'BR', club: 'Roma', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-wesley-card.webp') },
  { id: 208, name: 'L. Karl', ovr: 121, pos: 'CAM', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-karl-card.webp') },
  { id: 209, name: 'M. Maignan', ovr: 121, pos: 'GK', nation: 'Pháp', flag: 'FR', club: 'Milano', tier: 'stellar', wage: 28, cardFace: asset('/assets/ts-maignan-card.webp') },
  { id: 210, name: 'H. Koffi', ovr: 121, pos: 'GK', nation: 'Burkina Faso', flag: 'BF', club: 'Angers', tier: 'stellar', wage: 27, cardFace: asset('/assets/ts-koffi-card.webp') },
  { id: 211, name: 'M. Svilar', ovr: 121, pos: 'GK', nation: 'Serbia', flag: 'RS', club: 'Roma', tier: 'stellar', wage: 26, cardFace: asset('/assets/ts-svilar-card.webp') },
  { id: 262, name: 'Y. Begraoui', ovr: 119, pos: 'ST', nation: 'Ma-rốc', flag: 'MA', club: 'Estoril', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-begraoui-card.webp') },
  { id: 263, name: 'Borja Iglesias', ovr: 120, pos: 'ST', nation: 'Tây Ban Nha', flag: 'ES', club: 'Celta', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-borjaiglesias-card.webp') },
  { id: 264, name: 'E. Lepaul', ovr: 120, pos: 'ST', nation: 'Pháp', flag: 'FR', club: 'Rennes', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-lepaul-card.webp') },
  { id: 265, name: 'D. Welbeck', ovr: 120, pos: 'ST', nation: 'Anh', flag: 'EN', club: 'Brighton', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-welbeck-card.webp') },
  { id: 266, name: 'A. Dreyer', ovr: 120, pos: 'RW', nation: 'Đan Mạch', flag: 'DK', club: 'San Diego FC', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-dreyer-card.webp') },
  { id: 267, name: 'R. Højlund', ovr: 120, pos: 'ST', nation: 'Đan Mạch', flag: 'DK', club: 'Napoli', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-hojlund-card.webp') },
  { id: 268, name: 'T. Douvikas', ovr: 120, pos: 'ST', nation: 'Hy Lạp', flag: 'GR', club: 'Como', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-douvikas-card.webp') },
  { id: 269, name: 'Moleiro', ovr: 120, pos: 'LW', nation: 'Tây Ban Nha', flag: 'ES', club: 'Villarreal', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-moleiro-card.webp') },
  { id: 270, name: 'P. Aubameyang', ovr: 120, pos: 'ST', nation: 'Gabon', flag: 'GA', club: 'Marseille', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-aubameyang-card.webp') },
  { id: 271, name: 'Y. Carrasco', ovr: 120, pos: 'LW', nation: 'Bỉ', flag: 'BE', club: 'Al Shabab', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-carrasco-card.webp') },
  { id: 272, name: 'S. Al Dawsari', ovr: 120, pos: 'LW', nation: 'Ả Rập Xê Út', flag: 'SA', club: 'Al Hilal', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-aldawsari-card.webp') },
  { id: 273, name: 'V. Pavlidis', ovr: 120, pos: 'ST', nation: 'Hy Lạp', flag: 'GR', club: 'Benfica', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-pavlidis-card.webp') },
  { id: 274, name: 'S. Surridge', ovr: 120, pos: 'ST', nation: 'Anh', flag: 'EN', club: 'Nashville SC', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-surridge-card.webp') },
  { id: 275, name: 'A. Ueda', ovr: 120, pos: 'ST', nation: 'Nhật Bản', flag: 'JP', club: 'Feyenoord', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-ueda-card.webp') },
  { id: 276, name: 'A. Ezzalzouli', ovr: 121, pos: 'LW', nation: 'Ma-rốc', flag: 'MA', club: 'Real Betis', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-ezzalzouli-card.webp') },
  { id: 277, name: 'B. Barcola', ovr: 121, pos: 'LW', nation: 'Pháp', flag: 'FR', club: 'Paris', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-barcola-card.webp') },
  { id: 278, name: 'J. Panichelli', ovr: 121, pos: 'ST', nation: 'Argentina', flag: 'AR', club: 'Strasbourg', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-panichelli-card.webp') },
  { id: 279, name: 'C. Roldan', ovr: 118, pos: 'CM', nation: 'Hoa Kỳ', flag: 'US', club: 'Seattle Sounders', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-roldan-card.webp') },
  { id: 280, name: 'F. Aursnes', ovr: 119, pos: 'CM', nation: 'Na Uy', flag: 'NO', club: 'Benfica', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-aursnes-card.webp') },
  { id: 281, name: 'S. Berhalter', ovr: 119, pos: 'CM', nation: 'Hoa Kỳ', flag: 'US', club: 'Vancouver Whitecaps', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-berhalter-card.webp') },
  { id: 282, name: 'V. Froholdt', ovr: 119, pos: 'CM', nation: 'Đan Mạch', flag: 'DK', club: 'Porto', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-froholdt-card.webp') },
  { id: 283, name: 'Aleix Febas', ovr: 120, pos: 'CM', nation: 'Tây Ban Nha', flag: 'ES', club: 'Elche', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-febas-card.webp') },
  { id: 284, name: 'N. Vlašić', ovr: 120, pos: 'CM', nation: 'Croatia', flag: 'HR', club: 'Torino FC', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-vlasic-card.webp') },
  { id: 285, name: 'L. Camara', ovr: 120, pos: 'CM', nation: 'Senegal', flag: 'SN', club: 'Monaco', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-camara-card.webp') },
  { id: 286, name: 'K. Sano', ovr: 120, pos: 'CM', nation: 'Nhật Bản', flag: 'JP', club: 'NEC Nijmegen', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-sano-card.webp') },
  { id: 287, name: 'W. Zaïre-Emery', ovr: 121, pos: 'CM', nation: 'Pháp', flag: 'FR', club: 'Paris', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-zaireemery-card.webp') },
  { id: 288, name: 'K. Fortounis', ovr: 120, pos: 'CAM', nation: 'Hy Lạp', flag: 'GR', club: 'Al Khaleej', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-fortounis-card.webp') },
  { id: 289, name: 'A. Kramarić', ovr: 120, pos: 'CAM', nation: 'Croatia', flag: 'HR', club: 'Hoffenheim', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-kramaric-card.webp') },
  { id: 290, name: 'Evander', ovr: 120, pos: 'CAM', nation: 'Brazil', flag: 'BR', club: 'FC Cincinnati', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-evander-card.webp') },
  { id: 291, name: 'C. Baumgartner', ovr: 120, pos: 'CAM', nation: 'Áo', flag: 'AT', club: 'Leipzig', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-baumgartner-card.webp') },
  { id: 292, name: 'P. Šulc', ovr: 120, pos: 'CAM', nation: 'Séc', flag: 'CZ', club: 'Lyon', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-sulc-card.webp') },
  { id: 293, name: 'R. Zalazar', ovr: 120, pos: 'CAM', nation: 'Uruguay', flag: 'UY', club: 'Braga', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-zalazar-card.webp') },
  { id: 294, name: 'Trincão', ovr: 121, pos: 'CAM', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Sporting', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-trincao-card.webp') },
  { id: 295, name: 'Mailson', ovr: 118, pos: 'GK', nation: 'Brazil', flag: 'BR', club: 'Al Taawoun', tier: 'stellar', wage: 26, cardFace: asset('/assets/ts-mailson-card.webp') },
  { id: 296, name: 'D. St. Clair', ovr: 118, pos: 'GK', nation: 'Canada', flag: 'CA', club: 'Inter Miami', tier: 'stellar', wage: 26, cardFace: asset('/assets/ts-stclair-card.webp') },
  { id: 297, name: 'R. Koeman Jr.', ovr: 119, pos: 'GK', nation: 'Hà Lan', flag: 'NL', club: 'Telstar', tier: 'stellar', wage: 27, cardFace: asset('/assets/ts-koemanjr-card.webp') },
  { id: 298, name: 'O. Baumann', ovr: 119, pos: 'GK', nation: 'Đức', flag: 'DE', club: 'Hoffenheim', tier: 'stellar', wage: 27, cardFace: asset('/assets/ts-baumann-card.webp') },
  { id: 299, name: 'L. Carević', ovr: 119, pos: 'GK', nation: 'Montenegro', flag: 'ME', club: 'Famalicão', tier: 'stellar', wage: 27, cardFace: asset('/assets/ts-carevic-card.webp') },
  { id: 300, name: 'D. Nejašmić', ovr: 119, pos: 'CDM', nation: 'Croatia', flag: 'HR', club: 'NEC Nijmegen', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-nejasmic-card.webp') },
  { id: 301, name: 'A. Stiller', ovr: 121, pos: 'CDM', nation: 'Đức', flag: 'DE', club: 'Stuttgart', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-stiller-card.webp') },
  { id: 302, name: 'M. Akliouche', ovr: 120, pos: 'RM', nation: 'Pháp', flag: 'FR', club: 'Monaco', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-akliouche-card.webp') },
  { id: 303, name: 'B. André', ovr: 120, pos: 'CDM', nation: 'Pháp', flag: 'FR', club: 'Lille', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-andre-card.webp') },
  { id: 304, name: 'M. Perrone', ovr: 120, pos: 'CDM', nation: 'Argentina', flag: 'AR', club: 'Como', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-perrone-card.webp') },
  { id: 305, name: 'M. Palestra', ovr: 121, pos: 'RWB', nation: 'Ý', flag: 'IT', club: 'Cagliari', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-palestra-card.webp') },
  { id: 306, name: 'A. Saelemaekers', ovr: 121, pos: 'RWB', nation: 'Bỉ', flag: 'BE', club: 'Milano', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-saelemaekers-card.webp') },
  { id: 307, name: 'B. van Rooij', ovr: 119, pos: 'RB', nation: 'Hà Lan', flag: 'NL', club: 'Twente', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-vanrooij-card.webp') },
  { id: 308, name: 'A. Najar', ovr: 118, pos: 'RB', nation: 'Honduras', flag: 'HN', club: 'Nashville SC', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-najar-card.webp') },
  { id: 309, name: 'V. Coufal', ovr: 121, pos: 'RB', nation: 'CH Séc', flag: 'CZ', club: 'Hoffenheim', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-coufal-card.webp') },
  { id: 310, name: 'Pau Cubarsí', ovr: 121, pos: 'CB', nation: 'Tây Ban Nha', flag: 'ES', club: 'Barcelona', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-cubarsi-card.webp') },
  { id: 311, name: 'Pubill', ovr: 121, pos: 'CB', nation: 'Tây Ban Nha', flag: 'ES', club: 'Atlético', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-pubill-card.webp') },
  { id: 312, name: 'W. Pacho', ovr: 121, pos: 'CB', nation: 'Ecuador', flag: 'EC', club: 'Paris', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-pacho-card.webp') },
  { id: 313, name: 'J. Kiwior', ovr: 120, pos: 'CB', nation: 'Ba Lan', flag: 'PL', club: 'Porto', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-kiwior-card.webp') },
  { id: 314, name: 'Ibañez', ovr: 119, pos: 'CB', nation: 'Brazil', flag: 'BR', club: 'Al Ahli', tier: 'stellar', wage: 28, cardFace: asset('/assets/ts-ibanez-card.webp') },
  { id: 315, name: 'T. Watanabe', ovr: 119, pos: 'CB', nation: 'Nhật Bản', flag: 'JP', club: 'Feyenoord', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-watanabe-card.webp') },
  { id: 316, name: 'M. Simakan', ovr: 120, pos: 'CB', nation: 'Pháp', flag: 'FR', club: 'Al Nassr', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-simakan-card.webp') },
  { id: 317, name: 'T. Blackmon', ovr: 118, pos: 'CB', nation: 'Mỹ', flag: 'US', club: 'Vancouver Whitecaps', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-blackmon-card.webp') },
  { id: 318, name: 'J. Glesnes', ovr: 118, pos: 'CB', nation: 'Na Uy', flag: 'NO', club: 'LA Galaxy', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-glesnes-card.webp') },
  { id: 319, name: 'J. Schouten', ovr: 120, pos: 'CB', nation: 'Hà Lan', flag: 'NL', club: 'PSV', tier: 'stellar', wage: 30, cardFace: asset('/assets/ts-schouten-card.webp') },
  { id: 320, name: 'M. Niakhaté', ovr: 120, pos: 'CB', nation: 'Senegal', flag: 'SN', club: 'Lyon', tier: 'stellar', wage: 29, cardFace: asset('/assets/ts-niakhate-card.webp') },
  { id: 321, name: 'K. Koulibaly', ovr: 120, pos: 'CB', nation: 'Senegal', flag: 'SN', club: 'Al Hilal', tier: 'stellar', wage: 31, cardFace: asset('/assets/ts-koulibaly-card.webp') },
  { id: 322, name: 'G. Kobel', ovr: 122, pos: 'GK', nation: 'Thụy Sĩ', flag: 'CH', club: 'Dortmund', tier: 'stellar', wage: 28, cardFace: asset('/assets/ts-kobel-card.webp') },
  { id: 212, name: 'Jairzinho', ovr: 117, pos: 'RW', nation: 'Brazil', flag: 'BR', club: 'Botafogo', tier: 'origin', wage: 30, cardFace: asset('/assets/no7-jairzinho-card.webp'), teamLogo: no7TeamLogo },
  { id: 213, name: 'H. Nakata', ovr: 115, pos: 'CAM', nation: 'Nhật Bản', flag: 'JP', club: 'Parma', tier: 'origin', wage: 28, cardFace: asset('/assets/no7-nakata-card.webp'), teamLogo: no7TeamLogo },
  { id: 214, name: 'R. Mahrez', ovr: 115, pos: 'RW', nation: 'Algeria', flag: 'DZ', club: 'Al Ahli', tier: 'origin', wage: 28, cardFace: asset('/assets/no7-mahrez-card.webp') },
  { id: 215, name: 'Pedro Neto', ovr: 115, pos: 'LW', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Chelsea', tier: 'origin', wage: 28, cardFace: asset('/assets/no7-neto-card.webp') },
  { id: 216, name: 'Ramires', ovr: 116, pos: 'CDM', nation: 'Brazil', flag: 'BR', club: 'Chelsea', tier: 'origin', wage: 28, cardFace: asset('/assets/no7-ramires-card.webp'), teamLogo: no7TeamLogo },
  { id: 217, name: 'L. Díaz', ovr: 116, pos: 'LW', nation: 'Colombia', flag: 'CO', club: 'Bayern', tier: 'origin', wage: 28, cardFace: asset('/assets/no7-diaz-card.webp') },
  { id: 218, name: 'T. Rosický', ovr: 116, pos: 'CAM', nation: 'CH Séc', flag: 'CZ', club: 'Arsenal', tier: 'origin', wage: 29, cardFace: asset('/assets/no7-rosicky-card.webp'), teamLogo: no7TeamLogo },
  { id: 219, name: 'H. Larsson', ovr: 116, pos: 'ST', nation: 'Thụy Điển', flag: 'SE', club: 'Celtic', tier: 'origin', wage: 29, cardFace: asset('/assets/no7-larsson-card.webp'), teamLogo: no7TeamLogo },
  { id: 220, name: 'N. Kanté', ovr: 117, pos: 'CDM', nation: 'Pháp', flag: 'FR', club: 'Al Ittihad', tier: 'origin', wage: 28, cardFace: asset('/assets/no7-kante-card.webp') },
  { id: 221, name: 'D. Beckham', ovr: 117, pos: 'RM', nation: 'Anh', flag: 'EN', club: 'Manchester Đỏ', tier: 'origin', wage: 29, cardFace: asset('/assets/no7-beckham-card.webp'), teamLogo: no7TeamLogo },
  { id: 222, name: 'Park Ji Sung', ovr: 117, pos: 'CAM', nation: 'Hàn Quốc', flag: 'KR', club: 'Manchester Đỏ', tier: 'origin', wage: 29, cardFace: asset('/assets/no7-park-card.webp'), teamLogo: no7TeamLogo },
  { id: 223, name: 'Raúl', ovr: 117, pos: 'ST', nation: 'Tây Ban Nha', flag: 'ES', club: 'Madrid', tier: 'origin', wage: 29, cardFace: asset('/assets/no7-raul-card.webp'), teamLogo: no7TeamLogo },
  { id: 224, name: 'B. Saka', ovr: 117, pos: 'RW', nation: 'Anh', flag: 'EN', club: 'Arsenal', tier: 'origin', wage: 29, cardFace: asset('/assets/no7-saka-card.webp') },
  { id: 225, name: 'K. Dalglish', ovr: 117, pos: 'CF', nation: 'Scotland', flag: 'SC', club: 'Liverpool', tier: 'origin', wage: 29, cardFace: asset('/assets/no7-dalglish-card.webp'), teamLogo: no7TeamLogo },
  { id: 226, name: 'R. Pirès', ovr: 117, pos: 'LM', nation: 'Pháp', flag: 'FR', club: 'Arsenal', tier: 'origin', wage: 30, cardFace: asset('/assets/no7-pires-card.webp'), teamLogo: no7TeamLogo },
  { id: 227, name: 'D. Forlán', ovr: 117, pos: 'ST', nation: 'Uruguay', flag: 'UY', club: 'Atlético', tier: 'origin', wage: 30, cardFace: asset('/assets/no7-forlan-card.webp'), teamLogo: no7TeamLogo },
  { id: 228, name: 'F. Ribéry', ovr: 117, pos: 'LW', nation: 'Pháp', flag: 'FR', club: 'Bayern', tier: 'origin', wage: 30, cardFace: asset('/assets/no7-ribery-card.webp'), teamLogo: no7TeamLogo },
  { id: 229, name: 'E. Cantona', ovr: 117, pos: 'CF', nation: 'Pháp', flag: 'FR', club: 'Manchester Đỏ', tier: 'origin', wage: 30, cardFace: asset('/assets/no7-cantona-card.webp'), teamLogo: no7TeamLogo },
  { id: 230, name: 'E. Butragueño', ovr: 117, pos: 'CF', nation: 'Tây Ban Nha', flag: 'ES', club: 'Madrid', tier: 'origin', wage: 30, cardFace: asset('/assets/no7-butragueno-card.webp'), teamLogo: no7TeamLogo },
  { id: 231, name: 'H. Son', ovr: 117, pos: 'LW', nation: 'Hàn Quốc', flag: 'KR', club: 'Los Angeles FC', tier: 'origin', wage: 30, cardFace: asset('/assets/no7-son-card.webp') },
  { id: 232, name: 'G. Best', ovr: 118, pos: 'RW', nation: 'Bắc Ireland', flag: 'NI', club: 'Manchester Đỏ', tier: 'origin', wage: 30, cardFace: asset('/assets/no7-best-card.webp'), teamLogo: no7TeamLogo },
  { id: 233, name: 'Luís Figo', ovr: 118, pos: 'RW', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Barcelona', tier: 'origin', wage: 31, cardFace: asset('/assets/no7-figo-card.webp'), teamLogo: no7TeamLogo },
  { id: 234, name: 'A. Shevchenko', ovr: 118, pos: 'ST', nation: 'Ukraine', flag: 'UA', club: 'Milano', tier: 'origin', wage: 31, cardFace: asset('/assets/no7-shevchenko-card.webp'), teamLogo: no7TeamLogo },
  { id: 235, name: 'Cristiano Ronaldo', ovr: 119, pos: 'RW', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Al Nassr', tier: 'origin', wage: 32, cardFace: asset('/assets/no7-ronaldo-card.webp') },
  ...primePlayers,
  ...vietnamPlayers,
  ...prmPlayers,
  ...mdlPlayers,
  ...ambPlayers,
];
export const packs: Pack[] = [
  { id: 'eternal', name: 'ICONTM (ALL)', short: 'TM', price: 1500000, weights: [0, 0, 100, 0, 0, 0, 0, 0], description: 'Nơi những huyền thoại trở lại.', range: '117–127', color: 'gold', back: asset('/assets/icon-tm-back.webp'), tunnel: asset('/assets/itm-tunnel.webp'), accent: '#ffd23f', stage: { top: '#b8893a', ring: '#fff0c2' } },
  { id: 'stellar', name: '26TS (ALL)', short: '26TS', price: 500000, weights: [0, 100, 0, 0, 0, 0, 0, 0], description: 'Tỏa sáng cùng những ngôi sao.', range: '118–126', color: 'blue', back: asset('/assets/ts26-back.webp'), tunnel: asset('/assets/ts26-tunnel.webp'), accent: '#4f8dff', stage: { top: '#1f45c8', ring: '#8fb0ff' } },
  { id: 'origin', name: 'NO.7 (ALL)', short: 'NO.7', price: 100000, weights: [100, 0, 0, 0, 0, 0, 0, 0], description: '24 ngôi sao mang dấu ấn số 7.', range: '115–119', color: 'silver', back: asset('/assets/no7-back.webp'), tunnel: asset('/assets/no7-tunnel.webp'), stage: { top: '#5b6b7d', ring: '#d5e1eb' } },
  { id: 'prime', name: 'INFINITE PRIME (ALL)', short: 'IP', price: 2000000, weights: [0, 0, 0, 100, 0, 0, 0, 0], description: 'Đỉnh cao không giới hạn.', range: '124–136', color: 'gold', back: asset('/assets/prime-back.webp'), tunnel: asset('/assets/prime-tunnel.webp'), accent: '#e0473f', stage: { top: '#8e1420', ring: '#ffd98a', led: '#ffcf6b' } },
  { id: 'vietnam', name: 'VIETNAM (ALL)', short: 'VN', price: 1000000, weights: [0, 0, 0, 0, 100, 0, 0, 0], description: 'Những ngôi sao mang màu cờ sắc áo Việt Nam.', range: '105–119', color: 'red', back: asset('/assets/vietnam-back.webp'), tunnel: asset('/assets/vietnam-tunnel.webp'), accent: '#e8453c', stage: { top: '#a3121c', ring: '#f2c75c', led: '#ffd66b' } },
  { id: 'prm', name: 'PRIME (ALL)', short: 'PRM', price: 1800000, weights: [0, 0, 0, 0, 0, 100, 0, 0], description: 'Những ngôi sao rực lửa của mùa PRIME.', range: '119–126', color: 'red', back: asset('/assets/prm-back.webp'), tunnel: asset('/assets/prm-tunnel.webp'), accent: '#f06a2a', stage: { top: '#7d1208', ring: '#f3c56b', led: '#ffb24a' } },
  { id: 'mdl', name: 'MEDALIST (ALL)', short: 'MDL', price: 800000, weights: [0, 0, 0, 0, 0, 0, 100, 0], description: 'Những nhà vô địch mang huy chương.', range: '100–115', color: 'gold', back: asset('/assets/mdl-back.webp'), tunnel: asset('/assets/mdl-tunnel.webp'), accent: '#d8b45a', stage: { top: '#1f2a5c', ring: '#f0d38a', led: '#f4dc9c' } },
  { id: 'amb', name: 'FC AMBASSADOR (ALL)', short: 'FC', price: 900000, weights: [0, 0, 0, 0, 0, 0, 0, 100], description: 'Những đại sứ của FC.', range: '106–112', color: 'green', back: asset('/assets/amb-back.webp'), tunnel: asset('/assets/amb-tunnel.webp'), accent: '#2fd35a', stage: { top: '#0d5a22', ring: '#8dffa8', led: '#6dff8f' } },
];

export function isPackAvailable(pack: Pack): boolean {
  return TIERS.every((tier, i) => pack.weights[i] === 0 || players.some(player => player.tier === tier));
}
// Cấp cộng tối đa của thẻ; mỗi cấp có một huy hiệu riêng (+1 → +13).
// Mỗi dòng là cấp thẻ sau khi nâng cấp; tỷ lệ áp dụng ở 100% năng lượng.
export const UPGRADE_LEVELS = [
  { ovrGain: 0, chance: 0 },   // +1
  { ovrGain: 1, chance: 100 }, // +2
  { ovrGain: 1, chance: 81 },  // +3
  { ovrGain: 2, chance: 64 },  // +4
  { ovrGain: 2, chance: 50 },  // +5
  { ovrGain: 2, chance: 26 },  // +6
  { ovrGain: 3, chance: 15 },  // +7
  { ovrGain: 4, chance: 7 },   // +8
  { ovrGain: 2, chance: 5 },   // +9
  { ovrGain: 2, chance: 4 },   // +10
  { ovrGain: 2, chance: 3 },   // +11
  { ovrGain: 3, chance: 2 },   // +12
  { ovrGain: 3, chance: 1 },   // +13
] as const;
const levelOvrBonuses = UPGRADE_LEVELS.map((_, index) => UPGRADE_LEVELS.slice(0, index + 1).reduce((total, row) => total + row.ovrGain, 0));
export const MAX_LEVEL = UPGRADE_LEVELS.length;
// Tra cầu thủ theo id bằng Map (players.find mỗi lần gọi rất chậm khi sắp xếp/lọc hàng trăm thẻ).
const playerIndex = new Map(players.map(p => [p.id, p]));
export const getPlayer = (card: Pick<Card, 'playerId'>) => playerIndex.get(card.playerId)!;
// OVR game tự tính: OVR gốc + phần tăng theo cấp. OVR sửa tay trong gia-cau-thu-bp.xlsx (npm run prices:import) được ưu tiên.
export const baseOvr = (card: Pick<Card, 'playerId' | 'level'>) => players.find(p => p.id === card.playerId)!.ovr + (levelOvrBonuses[card.level - 1] ?? 0);
const manualOvrs: Record<string, Record<string, number>> = excelOverrides.ovrs;
export const ovr = (card: Pick<Card, 'playerId' | 'level'> & Partial<Card>) => manualOvrs[String(card.playerId)]?.[String(card.level)] ?? baseOvr(card);
export const money = (n: number) => {
  const magnitude = Math.abs(n);
  const divisor = magnitude >= 1e9 ? 1e9 : magnitude >= 1e6 ? 1e6 : 1;
  if (divisor === 1) return new Intl.NumberFormat('vi-VN').format(n);
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, useGrouping: false }).format(n / divisor)}${divisor === 1e9 ? 'B' : 'M'}`;
};
export const uid = () => crypto.randomUUID();
export function random() { return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; }
export function makeCard(playerId: number): Card { return { uid: uid(), playerId, level: 1, received: Date.now() }; }
export function initialSave(): Save {
  return { version: 1, unopened: { eternal: 15, stellar: 15, origin: 15, prime: 15, vietnam: 15, prm: 15, mdl: 15, amb: 15 }, balance: 15000000, cards: [11, 15].map(makeCard), history: [], daily: '', opened: 0, upgrades: 0, sound: false, reduced: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches };
}
export function draw(pack: Pack, rng = random): Card {
  if (!isPackAvailable(pack)) throw new Error(`${pack.name} chưa có cầu thủ. Vui lòng chờ cập nhật.`);
  const value = rng() * 100;
  // Cộng dồn tỷ lệ theo thứ tự TIERS; làm tròn số thực có thể vượt 100 thì lấy mùa cuối cùng có tỷ lệ.
  let below = 0, tier: Tier = TIERS[0];
  for (let i = 0; i < TIERS.length; i++) { if (pack.weights[i] <= 0) continue; tier = TIERS[i]; below += pack.weights[i]; if (value < below) break; }
  const pool = players.filter(p => p.tier === tier);
  return makeCard(pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].id);
}
export const getPackStock = (state: Save, pack: Pack): number => state.unopened?.[pack.id] ?? 15;

export const MAX_INVENTORY_OPEN = 150;

export const getPackOpeningCost = (state: Save, pack: Pack, count: number): number =>
  pack.price * Math.max(0, count - (state.prepaid?.[pack.id] ?? 0));

export function buyPacks(state: Save, requested: Pack, count: number, free = false): Save {
  const pack = packs.find(item => item.id === requested.id);
  if (!pack || !isPackAvailable(pack)) throw new Error('Gói này hiện chưa có trong shop.');
  if (!Number.isInteger(count) || count < 1 || count > MAX_INVENTORY_OPEN) throw new Error(`Hãy chọn từ 1 đến ${MAX_INVENTORY_OPEN} gói.`);
  const cost = pack.price * count;
  const stock = getPackStock(state, pack) + count;
  const prepaid = (state.prepaid?.[pack.id] ?? 0) + count;
  if (![cost, stock, prepaid].every(Number.isSafeInteger)) throw new Error('Số lượng gói vượt giới hạn lưu trữ.');
  if (!free && state.balance < cost) throw new Error('Không đủ xu để mua số gói này.');
  const entry: Entry = { id: uid(), time: Date.now(), type: 'shop', title: `Mua ${count} ${pack.name}`, detail: `Đã thêm vào kho vật phẩm · ${free ? 'Thử nghiệm · Không trừ xu' : `−${money(cost)} xu`} · Không thu thêm phí khi mở` };
  return {
    ...state,
    balance: free ? state.balance : state.balance - cost,
    unopened: { eternal: 15, stellar: 15, origin: 15, prime: 15, vietnam: 15, prm: 15, mdl: 15, amb: 15, ...state.unopened, [pack.id]: stock },
    prepaid: { ...state.prepaid, [pack.id]: prepaid },
    history: [entry, ...state.history].slice(0, 200),
  };
}

export function openSelectedPacks(state: Save, selected: Pack[], rng = random, free = false): { state: Save; cards: Card[]; pack: Pack } {
  let next = state;
  const cards: Card[] = [];
  const seen = new Set<string>();
  let openingPack: Pack | undefined;
  for (const pack of selected) {
    if (seen.has(pack.id) || !isPackAvailable(pack)) continue;
    seen.add(pack.id);
    const count = Math.min(getPackStock(next, pack), MAX_INVENTORY_OPEN - cards.length);
    if (count < 1) continue;
    const result = openPacks(next, pack, count, rng, free);
    next = result.state;
    cards.push(...result.cards);
    openingPack ??= pack;
    if (cards.length === MAX_INVENTORY_OPEN) break;
  }
  if (!openingPack) throw new Error('Hãy chọn vật phẩm còn trong kho để mở.');
  return { state: next, cards, pack: openingPack };
}

export function openPacks(state: Save, pack: Pack, count: number, rng = random, free = false): { state: Save; cards: Card[] } {
  if (!Number.isInteger(count) || count < 1 || count > MAX_INVENTORY_OPEN) throw new Error(`Hãy chọn từ 1 đến ${MAX_INVENTORY_OPEN} thẻ.`);
  const cost = free ? 0 : getPackOpeningCost(state, pack, count);
  if (state.balance < cost) throw new Error('Không đủ xu để mở gói này. Hãy nhận quà điểm danh hoặc chọn gói khác.');
  const available = getPackStock(state, pack);
  if (count > available) throw new Error(`Chỉ còn ${available} gói chưa mở. Hãy nhận thêm gói trước khi mở tiếp.`);
  const cards = Array.from({ length: count }, () => draw(pack, rng));
  const best = [...cards].sort((a, b) => ovr(b) - ovr(a))[0];
  const entry: Entry = { id: uid(), time: Date.now(), type: 'pack', title: `Mở ${count} ${pack.name.toLowerCase()}`, detail: `${getPlayer(best).name} · OVR ${ovr(best)} · ${free ? 'Thử nghiệm · Không trừ xu' : cost === 0 ? 'Gói đã thanh toán · Không trừ thêm xu' : `−${money(cost)} xu`}` };
  return { state: { ...state, unopened: { eternal: 15, stellar: 15, origin: 15, prime: 15, vietnam: 15, prm: 15, mdl: 15, amb: 15, ...state.unopened, [pack.id]: available - count }, ...(state.prepaid ? { prepaid: { ...state.prepaid, [pack.id]: Math.max(0, (state.prepaid[pack.id] ?? 0) - count) } } : {}), balance: state.balance - cost, cards: [...cards, ...state.cards], history: [entry, ...state.history].slice(0, 200), opened: state.opened + count }, cards };
}
export function upgradeInfo(target: Card, materials: Card[]) {
  const targetOvr = ovr(target);
  // Một vạch = 20%; giữ mức cùng OVR đã chốt, tối đa 5 vạch mỗi thẻ.
  const equalOvrEnergy = Math.min(100, 20 + Math.max(0, 125 - targetOvr) * 5);
  const total = materials.reduce((sum, material) => {
    const difference = ovr(material) - targetOvr;
    // Thấp hơn 7 OVR còn 1/5 mức cùng OVR: phôi 122 đập 129 được 4% năng lượng.
    const contribution = difference < 0 ? equalOvrEnergy * Math.pow(5, difference / 7) : equalOvrEnergy + difference * 1.2;
    // Cộng đúng phần năng lượng 0,1% hiển thị ở từng phôi.
    return sum + Math.round(Math.min(100, contribution) * 10) / 10;
  }, 0);
  const energy = Math.round(Math.min(100, total) * 10) / 10;
  const base = UPGRADE_LEVELS[target.level]?.chance ?? 0;
  return { energy, chance: Math.round(base * energy / 100 * 10) / 10, cost: target.level * 100000 };
}
// rng quyết định thành công / mức rớt; patternRng chọn cầu ngầm. Tách hai luồng để chuỗi roll kết quả giữ nguyên khi thêm bắt cầu.
// protection: bảo vệ nâng cấp (thẻ từ +8) — pct% cơ hội giữ nguyên cấp khi thất bại, cost xu trả trước dù kết quả thế nào; tính phí ở insurance.ts.
export const PROTECT_MIN_LEVEL = 8;
export function upgrade(state: Save, targetId: string, materialIds: string[], rng: Rng = random, free = false, options: { role?: UpgradeRole; patternRng?: Rng; protection?: { pct: number; cost: number } } = {}) {
  const target = state.cards.find(c => c.uid === targetId);
  if (!target || target.level >= MAX_LEVEL) throw new Error(`Chọn thẻ chính có cấp cộng dưới +${MAX_LEVEL}.`);
  if (materialIds.length < 1 || materialIds.length > 5 || new Set(materialIds).size !== materialIds.length || materialIds.includes(targetId)) throw new Error('Cần chọn từ 1 đến 5 thẻ nguyên liệu khác nhau.');
  const materials = materialIds.map(id => state.cards.find(c => c.uid === id));
  if (materials.some(c => !c)) throw new Error('Nguyên liệu không còn trong kho.');
  const selected = materials as Card[];
  const lockedMaterial = selected.find(c => state.locked?.includes(c.uid));
  if (lockedMaterial) throw new Error(`${getPlayer(lockedMaterial).name} đang bị khóa, không dùng làm nguyên liệu được.`);
  const info = upgradeInfo(target, selected);
  const protection = options.protection && options.protection.pct > 0 ? options.protection : null;
  if (protection && (!Number.isInteger(protection.pct) || protection.pct > 100 || !Number.isSafeInteger(protection.cost) || protection.cost < 0)) throw new Error('Mức bảo vệ nâng cấp không hợp lệ.');
  if (protection && target.level < PROTECT_MIN_LEVEL) throw new Error(`Bảo vệ nâng cấp chỉ áp dụng cho thẻ từ +${PROTECT_MIN_LEVEL}.`);
  const protectCost = protection?.cost ?? 0;
  if (!free && state.balance < info.cost + protectCost) throw new Error(protectCost ? 'Bạn không đủ xu cho phí nâng cấp và phí bảo vệ.' : 'Bạn không đủ xu nâng cấp.');
  // Tỷ lệ gốc = bảng UPGRADE_LEVELS theo năng lượng nguyên liệu; engine bắt cầu cộng thưởng rồi roll.
  const turn = resolveUpgrade(state.bridge ?? emptyBridge(), { currentLevel: target.level, baseRate: info.chance, role: options.role ?? 'main' }, { outcome: rng, pattern: options.patternRng ?? random });
  const { success, drop: droppedLevel } = turn;
  const recoveryFloor = Math.max(0, ...selected.filter(card => card.playerId === target.playerId).map(card => card.level));
  // Roll bảo vệ chỉ xảy ra khi thất bại và có bảo vệ, nên chuỗi RNG của các lượt không bảo vệ giữ nguyên.
  const shielded = !success && !!protection && rng() * 100 < protection.pct;
  const restoredLevel = !shielded && droppedLevel !== null && recoveryFloor > droppedLevel ? recoveryFloor : null;
  const result = { ...target, level: success ? target.level + 1 : shielded ? target.level : restoredLevel ?? droppedLevel! };
  const transition = shielded ? `+${target.level} → giữ nguyên +${target.level} · Bảo vệ nâng cấp` : restoredLevel !== null ? `+${target.level} → +${droppedLevel} → +${result.level} · Phục hồi bằng phôi trùng` : `+${target.level} → +${result.level}`;
  const entry: Entry = { id: uid(), time: Date.now(), type: 'upgrade', success, title: `${success ? 'Thành công' : 'Thất bại'} · ${getPlayer(target).name}`, detail: `${transition} · ${materials.length} nguyên liệu${protection ? ` · Bảo vệ ${protection.pct}%` : ''} · ${free ? 'Thử nghiệm · Không trừ xu' : `−${money(info.cost + protectCost)} xu`}` };
  return { state: { ...state, balance: free ? state.balance : state.balance - info.cost - protectCost, cards: state.cards.filter(c => !materialIds.includes(c.uid)).map(c => c.uid === targetId ? result : c), history: [entry, ...state.history].slice(0, 200), upgrades: state.upgrades + 1, bridge: turn.bridge }, result, success, info, droppedLevel, restoredLevel, shielded, protectCost, turn: turn.turn };
}
export function dayKey(date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
export function claimDaily(state: Save): Save {
  const today = dayKey();
  if (state.daily === today) throw new Error('Bạn đã nhận quà hôm nay. Hẹn gặp lại vào ngày mai!');
  return { ...state, daily: today, balance: state.balance + 1000000, history: [{ id: uid(), time: Date.now(), type: 'gift' as const, title: 'Quà điểm danh mỗi ngày', detail: '+1.000.000 xu vào tài khoản' }, ...state.history].slice(0, 200) };
}
export const STORAGE_KEY = 'arena-huyen-thoai-v1';
// Thẻ ICON cũ đã rút khỏi danh sách được đổi sang ICON mới để bản lưu cũ vẫn mở được.
const retiredIcons: Record<number, number> = { 2: 31, 7: 1 };
export function validateSave(data: unknown): data is Save {
  if (!data || typeof data !== 'object') return false;
  const s = data as Save;
  if (Array.isArray(s.cards)) {
    // Loại thẻ Khởi nguyên đã ngừng dùng, giữ lại tiến trình và thẻ của các mùa khác.
    s.cards = s.cards.filter(c => !c || !Number.isInteger(c.playerId) || c.playerId < 21 || c.playerId > 30);
    for (const c of s.cards) if (c && retiredIcons[c.playerId]) c.playerId = retiredIcons[c.playerId];
  }
  // Trạng thái cầu hỏng thì bỏ, engine bắt đầu lại; không làm mất cả bản lưu.
  if (s.bridge !== undefined && !isBridgeState(s.bridge)) delete s.bridge;
  // Đội hình riêng (Quản lí CT): bỏ dữ liệu sai kiểu, thẻ không còn trong kho và uid trùng.
  if (s.squad !== undefined) {
    const owned = new Set(Array.isArray(s.cards) ? s.cards.map(c => c?.uid) : []);
    if (Array.isArray(s.squad)) s.squad = [...new Set(s.squad.filter(uid => typeof uid === 'string' && owned.has(uid)))]; else delete s.squad;
  }
  // Mức bảo vệ nâng cấp đã lưu: sai kiểu thì bỏ.
  if (s.protection !== undefined && !(s.protection && Number.isInteger(s.protection.pct) && s.protection.pct >= 0 && s.protection.pct <= 100 && s.protection.pct % 10 === 0 && typeof s.protection.fixed === 'boolean')) delete s.protection;
  if (s.locked !== undefined) {
    const owned = new Set(Array.isArray(s.cards) ? s.cards.map(c => c?.uid) : []);
    if (Array.isArray(s.locked)) s.locked = [...new Set(s.locked.filter(uid => typeof uid === 'string' && owned.has(uid)))]; else delete s.locked;
  }
  if (s.prepaid !== undefined && (!s.prepaid || typeof s.prepaid !== 'object' || Array.isArray(s.prepaid) || !Object.entries(s.prepaid).every(([id, count]) => { const pack = packs.find(p => p.id === id); return !!pack && Number.isSafeInteger(count) && count >= 0 && count <= getPackStock(s, pack); }))) return false;
  return s.version === 1 && Number.isSafeInteger(s.balance) && s.balance >= 0 && Array.isArray(s.cards) && s.cards.every(c => c && typeof c.uid === 'string' && players.some(p => p.id === c.playerId) && Number.isInteger(c.level) && c.level >= 1 && c.level <= MAX_LEVEL && Number.isFinite(c.received)) && new Set(s.cards.map(c => c.uid)).size === s.cards.length && Array.isArray(s.history) && s.history.every(e => e && typeof e.id === 'string' && Number.isFinite(e.time) && ['pack', 'upgrade', 'gift', 'market', 'shop'].includes(e.type) && typeof e.title === 'string' && typeof e.detail === 'string') && typeof s.daily === 'string' && Number.isSafeInteger(s.opened) && s.opened >= 0 && Number.isSafeInteger(s.upgrades) && s.upgrades >= 0 && typeof s.sound === 'boolean' && typeof s.reduced === 'boolean' && (s.quick === undefined || typeof s.quick === 'boolean') && (s.light === undefined || typeof s.light === 'boolean') && (s.unopened === undefined || (!!s.unopened && typeof s.unopened === 'object' && !Array.isArray(s.unopened) && packs.every(p => s.unopened![p.id] === undefined || (Number.isSafeInteger(s.unopened![p.id]) && s.unopened![p.id] >= 0))));
}
