export type Tier = 'origin' | 'stellar' | 'eternal';
export type Player = { id: number; name: string; ovr: number; pos: string; nation: string; flag: string; club: string; tier: Tier; image?: string; value?: number; wage?: number; cardFace?: string };
export type Card = { uid: string; playerId: number; level: number; received: number };
export type Entry = { id: string; time: number; type: 'pack' | 'upgrade' | 'gift' | 'market'; title: string; detail: string; success?: boolean };
export type Save = { version: 1; balance: number; cards: Card[]; history: Entry[]; daily: string; opened: number; upgrades: number; sound: boolean; reduced: boolean; quick?: boolean; light?: boolean; unopened?: Record<string, number> };
export type Pack = { id: string; name: string; short: string; price: number; weights: [number, number, number]; description: string; range: string; color: string };
export const seasons: Record<Tier, string> = { origin: 'Khởi nguyên', stellar: 'Tinh tú', eternal: 'ICON TM' };
export const players: Player[] = [
  { id: 1, name: 'Ronaldo', ovr: 126, pos: 'ST', nation: 'Brazil', flag: 'BR', club: 'Milano', tier: 'eternal', value: 1800000, wage: 34, cardFace: '/assets/ronaldo-card.png' },
  { id: 31, name: 'Pelé', ovr: 127, pos: 'CF', nation: 'Brazil', flag: 'BR', club: 'Santos', tier: 'eternal', value: 1300000, wage: 34, cardFace: '/assets/pele-card.png' },
  { id: 32, name: 'J. Cruyff', ovr: 126, pos: 'CF', nation: 'Hà Lan', flag: 'NL', club: 'Ajax', tier: 'eternal', value: 1200000, wage: 33, cardFace: '/assets/cruyff-card.png' },
  { id: 33, name: 'R. Gullit', ovr: 125, pos: 'CF', nation: 'Hà Lan', flag: 'NL', club: 'Milano', tier: 'eternal', value: 2000000, wage: 34, cardFace: '/assets/gullit-card.png' },
  { id: 5, name: 'T. Henry', ovr: 124, pos: 'ST', nation: 'Pháp', flag: 'FR', club: 'Arsenal', tier: 'eternal', value: 850000, wage: 32, cardFace: '/assets/henry-card.png' },
  { id: 34, name: 'Eusébio', ovr: 125, pos: 'ST', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Benfica', tier: 'eternal', value: 900000, wage: 33, cardFace: '/assets/eusebio-card.png' },
  { id: 35, name: 'W. Rooney', ovr: 124, pos: 'ST', nation: 'Anh', flag: 'EN', club: 'Manchester Đỏ', tier: 'eternal', value: 500000, wage: 32, cardFace: '/assets/rooney-card.png' },
  { id: 36, name: 'D. Drogba', ovr: 124, pos: 'ST', nation: 'Bờ Biển Ngà', flag: 'CI', club: 'Chelsea', tier: 'eternal', value: 450000, wage: 33, cardFace: '/assets/drogba-card.png' },
  { id: 37, name: 'Fernando Torres', ovr: 122, pos: 'ST', nation: 'Tây Ban Nha', flag: 'ES', club: 'Liverpool', tier: 'eternal', value: 350000, wage: 32, cardFace: '/assets/torres-card.png' },
  { id: 3, name: 'Z. Zidane', ovr: 123, pos: 'CAM', nation: 'Pháp', flag: 'FR', club: 'Madrid', tier: 'eternal', value: 1100000, wage: 34, cardFace: '/assets/zidane-card.webp' },
  { id: 4, name: 'Ronaldinho', ovr: 125, pos: 'LW', nation: 'Brazil', flag: 'BR', club: 'Barcelona', tier: 'eternal', value: 950000, wage: 32, cardFace: '/assets/ronaldinho-card.png' },
  { id: 8, name: 'D. Beckham', ovr: 124, pos: 'RM', nation: 'Anh', flag: 'EN', club: 'Manchester Đỏ', tier: 'eternal', value: 600000, wage: 32, cardFace: '/assets/beckham-card.png' },
  { id: 38, name: 'Kaká', ovr: 124, pos: 'CAM', nation: 'Brazil', flag: 'BR', club: 'Milano', tier: 'eternal', value: 600000, wage: 33, cardFace: '/assets/kaka-card.png' },
  { id: 39, name: 'P. Vieira', ovr: 123, pos: 'CDM', nation: 'Pháp', flag: 'FR', club: 'Arsenal', tier: 'eternal', value: 800000, wage: 32, cardFace: '/assets/vieira-card.png' },
  { id: 40, name: 'M. Ballack', ovr: 123, pos: 'CAM', nation: 'Đức', flag: 'DE', club: 'Chelsea', tier: 'eternal', value: 500000, wage: 32, cardFace: '/assets/ballack-card.png' },
  { id: 41, name: 'S. Gerrard', ovr: 123, pos: 'CAM', nation: 'Anh', flag: 'EN', club: 'Liverpool', tier: 'eternal', value: 400000, wage: 32, cardFace: '/assets/gerrard-card.png' },
  { id: 42, name: 'Park Ji-sung', ovr: 122, pos: 'CAM', nation: 'Hàn Quốc', flag: 'KR', club: 'Manchester Đỏ', tier: 'eternal', value: 300000, wage: 31, cardFace: '/assets/park-card.webp' },
  { id: 6, name: 'P. Maldini', ovr: 125, pos: 'LB', nation: 'Ý', flag: 'IT', club: 'Milano', tier: 'eternal', value: 700000, wage: 32, cardFace: '/assets/maldini-card.png' },
  { id: 43, name: 'R. Ferdinand', ovr: 123, pos: 'CB', nation: 'Anh', flag: 'EN', club: 'Manchester Đỏ', tier: 'eternal', value: 480000, wage: 32, cardFace: '/assets/ferdinand-card.png' },
  { id: 44, name: 'N. Vidić', ovr: 122, pos: 'CB', nation: 'Serbia', flag: 'RS', club: 'Manchester Đỏ', tier: 'eternal', value: 300000, wage: 31, cardFace: '/assets/vidic-card.png' },
  { id: 45, name: 'Roberto Carlos', ovr: 124, pos: 'LB', nation: 'Brazil', flag: 'BR', club: 'Madrid', tier: 'eternal', value: 250000, wage: 32, cardFace: '/assets/rcarlos-card.webp' },
  { id: 46, name: 'L. Yashin', ovr: 126, pos: 'GK', nation: 'Nga', flag: 'RU', club: 'Dynamo', tier: 'eternal', value: 200000, wage: 29, cardFace: '/assets/yashin-card.png' },
  { id: 47, name: 'E. van der Sar', ovr: 121, pos: 'GK', nation: 'Hà Lan', flag: 'NL', club: 'Manchester Đỏ', tier: 'eternal', value: 280000, wage: 27, cardFace: '/assets/vandersar-card.png' },
  { id: 48, name: 'P. Čech', ovr: 122, pos: 'GK', nation: 'Séc', flag: 'CZ', club: 'Chelsea', tier: 'eternal', value: 250000, wage: 27, cardFace: '/assets/cech-card.png' },
  { id: 49, name: 'D. Maradona', ovr: 127, pos: 'CAM', nation: 'Argentina', flag: 'AR', club: 'Napoli', tier: 'eternal', wage: 33, cardFace: '/assets/maradona-card.webp' },
  { id: 50, name: 'M. van Basten', ovr: 126, pos: 'ST', nation: 'Hà Lan', flag: 'NL', club: 'Milano', tier: 'eternal', wage: 34, cardFace: '/assets/vanbasten-card.webp' },
  { id: 51, name: 'G. Müller', ovr: 126, pos: 'ST', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'eternal', wage: 34, cardFace: '/assets/muller-card.webp' },
  { id: 52, name: 'F. Beckenbauer', ovr: 126, pos: 'CB', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'eternal', wage: 33, cardFace: '/assets/beckenbauer-card.webp' },
  { id: 53, name: 'Ferenc Puskás', ovr: 126, pos: 'CF', nation: 'Hungary', flag: 'HU', club: 'Madrid', tier: 'eternal', wage: 32, cardFace: '/assets/puskas-card.webp' },
  { id: 54, name: 'G. Best', ovr: 125, pos: 'RW', nation: 'Bắc Ireland', flag: 'NI', club: 'Manchester Đỏ', tier: 'eternal', wage: 33, cardFace: '/assets/best-card.webp' },
  { id: 55, name: 'R. Baggio', ovr: 125, pos: 'CF', nation: 'Ý', flag: 'IT', club: 'Torino', tier: 'eternal', wage: 33, cardFace: '/assets/baggio-card.webp' },
  { id: 56, name: 'Jairzinho', ovr: 125, pos: 'RW', nation: 'Brazil', flag: 'BR', club: 'Botafogo', tier: 'eternal', wage: 32, cardFace: '/assets/jairzinho-card.webp' },
  { id: 57, name: 'Garrincha', ovr: 125, pos: 'RW', nation: 'Brazil', flag: 'BR', club: 'Botafogo', tier: 'eternal', wage: 32, cardFace: '/assets/garrincha-card.webp' },
  { id: 58, name: 'B. Charlton', ovr: 125, pos: 'CAM', nation: 'Anh', flag: 'EN', club: 'Manchester Đỏ', tier: 'eternal', wage: 32, cardFace: '/assets/charlton-card.webp' },
  { id: 59, name: 'F. Baresi', ovr: 125, pos: 'CB', nation: 'Ý', flag: 'IT', club: 'Milano', tier: 'eternal', wage: 32, cardFace: '/assets/baresi-card.webp' },
  { id: 60, name: 'Zico', ovr: 125, pos: 'CAM', nation: 'Brazil', flag: 'BR', club: 'Flamengo', tier: 'eternal', wage: 32, cardFace: '/assets/zico-card.webp' },
  { id: 61, name: 'Iniesta', ovr: 125, pos: 'CM', nation: 'Tây Ban Nha', flag: 'ES', club: 'Barcelona', tier: 'eternal', wage: 32, cardFace: '/assets/iniesta-card.webp' },
  { id: 62, name: 'Xavi', ovr: 125, pos: 'CM', nation: 'Tây Ban Nha', flag: 'ES', club: 'Barcelona', tier: 'eternal', wage: 31, cardFace: '/assets/xavi-card.webp' },
  { id: 63, name: 'G. Buffon', ovr: 125, pos: 'GK', nation: 'Ý', flag: 'IT', club: 'Torino', tier: 'eternal', wage: 29, cardFace: '/assets/buffon-card.webp' },
  { id: 64, name: 'E. Cantona', ovr: 124, pos: 'CF', nation: 'Pháp', flag: 'FR', club: 'Manchester Đỏ', tier: 'eternal', wage: 33, cardFace: '/assets/cantona-card.webp' },
  { id: 65, name: 'Z. Ibrahimović', ovr: 124, pos: 'ST', nation: 'Thụy Điển', flag: 'SE', club: 'Milano', tier: 'eternal', wage: 33, cardFace: '/assets/ibrahimovic-card.webp' },
  { id: 66, name: 'A. Shevchenko', ovr: 124, pos: 'ST', nation: 'Ukraine', flag: 'UA', club: 'Milano', tier: 'eternal', wage: 33, cardFace: '/assets/shevchenko-card.webp' },
  { id: 67, name: 'F. Totti', ovr: 124, pos: 'CF', nation: 'Ý', flag: 'IT', club: 'Roma', tier: 'eternal', wage: 33, cardFace: '/assets/totti-card.webp' },
  { id: 68, name: 'Gabriel Batistuta', ovr: 124, pos: 'ST', nation: 'Argentina', flag: 'AR', club: 'Fiorentina', tier: 'eternal', wage: 32, cardFace: '/assets/batistuta-card.webp' },
  { id: 9, name: 'A. Pirlo', ovr: 124, pos: 'CM', nation: 'Ý', flag: 'IT', club: 'Milano', tier: 'eternal', wage: 32, cardFace: '/assets/pirlo-card.webp' },
  { id: 10, name: 'Casillas', ovr: 124, pos: 'GK', nation: 'Tây Ban Nha', flag: 'ES', club: 'Madrid', tier: 'eternal', wage: 27, cardFace: '/assets/casillas-card.webp' },
  { id: 69, name: 'F. Rijkaard', ovr: 124, pos: 'CDM', nation: 'Hà Lan', flag: 'NL', club: 'Milano', tier: 'eternal', wage: 32, cardFace: '/assets/rijkaard-card.webp' },
  { id: 70, name: 'H. Sánchez', ovr: 124, pos: 'ST', nation: 'Mexico', flag: 'MX', club: 'Madrid', tier: 'eternal', wage: 32, cardFace: '/assets/sanchez-card.webp' },
  { id: 71, name: 'R. van Nistelrooy', ovr: 124, pos: 'ST', nation: 'Hà Lan', flag: 'NL', club: 'Manchester Đỏ', tier: 'eternal', wage: 32, cardFace: '/assets/nistelrooy-card.webp' },
  { id: 72, name: 'S. Eto\'o', ovr: 124, pos: 'ST', nation: 'Cameroon', flag: 'CM', club: 'Barcelona', tier: 'eternal', wage: 32, cardFace: '/assets/etoo-card.webp' },
  { id: 73, name: 'Luís Figo', ovr: 124, pos: 'RW', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Madrid', tier: 'eternal', wage: 32, cardFace: '/assets/figo-card.webp' },
  { id: 74, name: 'Rivaldo', ovr: 124, pos: 'CAM', nation: 'Brazil', flag: 'BR', club: 'Barcelona', tier: 'eternal', wage: 32, cardFace: '/assets/rivaldo-card.webp' },
  { id: 75, name: 'D. Bergkamp', ovr: 124, pos: 'CF', nation: 'Hà Lan', flag: 'NL', club: 'Arsenal', tier: 'eternal', wage: 32, cardFace: '/assets/bergkamp-card.webp' },
  { id: 76, name: 'A. Nesta', ovr: 124, pos: 'CB', nation: 'Ý', flag: 'IT', club: 'Milano', tier: 'eternal', wage: 32, cardFace: '/assets/nesta-card.webp' },
  { id: 77, name: 'A. Shearer', ovr: 124, pos: 'ST', nation: 'Anh', flag: 'EN', club: 'Newcastle', tier: 'eternal', wage: 32, cardFace: '/assets/shearer-card.webp' },
  { id: 78, name: 'Cafu', ovr: 124, pos: 'RB', nation: 'Brazil', flag: 'BR', club: 'Milano', tier: 'eternal', wage: 31, cardFace: '/assets/cafu-card.webp' },
  { id: 79, name: 'F. Cannavaro', ovr: 124, pos: 'CB', nation: 'Ý', flag: 'IT', club: 'Madrid', tier: 'eternal', wage: 31, cardFace: '/assets/cannavaro-card.webp' },
  { id: 80, name: 'O. Kahn', ovr: 124, pos: 'GK', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'eternal', wage: 28, cardFace: '/assets/kahn-card.webp' },
  { id: 81, name: 'K. Dalglish', ovr: 123, pos: 'CF', nation: 'Scotland', flag: 'SC', club: 'Liverpool', tier: 'eternal', wage: 32, cardFace: '/assets/dalglish-card.webp' },
  { id: 82, name: 'Dunga', ovr: 123, pos: 'CDM', nation: 'Brazil', flag: 'BR', club: 'Fiorentina', tier: 'eternal', wage: 32, cardFace: '/assets/dunga-card.webp' },
  { id: 83, name: 'B. Cha', ovr: 123, pos: 'ST', nation: 'Hàn Quốc', flag: 'KR', club: 'Leverkusen', tier: 'eternal', wage: 32, cardFace: '/assets/bcha-card.webp' },
  { id: 84, name: 'T. Kroos', ovr: 123, pos: 'CM', nation: 'Đức', flag: 'DE', club: 'Madrid', tier: 'eternal', wage: 32, cardFace: '/assets/kroos-card.webp' },
  { id: 85, name: 'Marcelo', ovr: 123, pos: 'LB', nation: 'Brazil', flag: 'BR', club: 'Madrid', tier: 'eternal', wage: 32, cardFace: '/assets/marcelo-card.webp' },
  { id: 86, name: 'M. Klose', ovr: 123, pos: 'ST', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'eternal', wage: 32, cardFace: '/assets/klose-card.webp' },
  { id: 87, name: 'R. van Persie', ovr: 123, pos: 'ST', nation: 'Hà Lan', flag: 'NL', club: 'Arsenal', tier: 'eternal', wage: 32, cardFace: '/assets/vanpersie-card.webp' },
  { id: 88, name: 'P. Nedvěd', ovr: 123, pos: 'CAM', nation: 'Séc', flag: 'CZ', club: 'Torino', tier: 'eternal', wage: 32, cardFace: '/assets/nedved-card.webp' },
  { id: 89, name: 'F. Lampard', ovr: 123, pos: 'CM', nation: 'Anh', flag: 'EN', club: 'Chelsea', tier: 'eternal', wage: 32, cardFace: '/assets/lampard-card.webp' },
  { id: 90, name: 'A. Del Piero', ovr: 123, pos: 'CF', nation: 'Ý', flag: 'IT', club: 'Torino', tier: 'eternal', wage: 32, cardFace: '/assets/delpiero-card.webp' },
  { id: 91, name: 'I. Rush', ovr: 123, pos: 'ST', nation: 'Wales', flag: 'WL', club: 'Liverpool', tier: 'eternal', wage: 31, cardFace: '/assets/rush-card.webp' },
  { id: 92, name: 'B. Moore', ovr: 123, pos: 'CB', nation: 'Anh', flag: 'EN', club: 'West Ham', tier: 'eternal', wage: 31, cardFace: '/assets/moore-card.webp' },
  { id: 93, name: 'R. Koeman', ovr: 123, pos: 'CB', nation: 'Hà Lan', flag: 'NL', club: 'Barcelona', tier: 'eternal', wage: 31, cardFace: '/assets/koeman-card.webp' },
  { id: 94, name: 'Carlos Alberto', ovr: 123, pos: 'RB', nation: 'Brazil', flag: 'BR', club: 'Santos', tier: 'eternal', wage: 31, cardFace: '/assets/carlosalberto-card.webp' },
  { id: 95, name: 'P. Lahm', ovr: 123, pos: 'RB', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'eternal', wage: 31, cardFace: '/assets/lahm-card.webp' },
  { id: 96, name: 'Raúl', ovr: 123, pos: 'CF', nation: 'Tây Ban Nha', flag: 'ES', club: 'Madrid', tier: 'eternal', wage: 31, cardFace: '/assets/raul-card.webp' },
  { id: 97, name: 'Xabi Alonso', ovr: 123, pos: 'CM', nation: 'Tây Ban Nha', flag: 'ES', club: 'Liverpool', tier: 'eternal', wage: 31, cardFace: '/assets/xabialonso-card.webp' },
  { id: 98, name: 'C. Puyol', ovr: 123, pos: 'CB', nation: 'Tây Ban Nha', flag: 'ES', club: 'Barcelona', tier: 'eternal', wage: 31, cardFace: '/assets/puyol-card.webp' },
  { id: 99, name: 'M. Owen', ovr: 123, pos: 'ST', nation: 'Anh', flag: 'EN', club: 'Liverpool', tier: 'eternal', wage: 31, cardFace: '/assets/owen-card.webp' },
  { id: 100, name: 'L. Thuram', ovr: 123, pos: 'RB', nation: 'Pháp', flag: 'FR', club: 'Torino', tier: 'eternal', wage: 31, cardFace: '/assets/thuram-card.webp' },
  { id: 101, name: 'J. Zanetti', ovr: 123, pos: 'LB', nation: 'Argentina', flag: 'AR', club: 'Milano', tier: 'eternal', wage: 31, cardFace: '/assets/zanetti-card.webp' },
  { id: 102, name: 'P. Scholes', ovr: 123, pos: 'CM', nation: 'Anh', flag: 'EN', club: 'Manchester Đỏ', tier: 'eternal', wage: 31, cardFace: '/assets/scholes-card.webp' },
  { id: 103, name: 'P. Schmeichel', ovr: 123, pos: 'GK', nation: 'Đan Mạch', flag: 'DK', club: 'Manchester Đỏ', tier: 'eternal', wage: 28, cardFace: '/assets/schmeichel-card.webp' },
  { id: 104, name: 'Y. Touré', ovr: 122, pos: 'CM', nation: 'Bờ Biển Ngà', flag: 'CI', club: 'Manchester Xanh', tier: 'eternal', wage: 32, cardFace: '/assets/toure-card.webp' },
  { id: 105, name: 'M. Laudrup', ovr: 122, pos: 'CF', nation: 'Đan Mạch', flag: 'DK', club: 'Barcelona', tier: 'eternal', wage: 31, cardFace: '/assets/laudrup-card.webp' },
  { id: 106, name: 'G. Lineker', ovr: 122, pos: 'ST', nation: 'Anh', flag: 'EN', club: 'Tottenham', tier: 'eternal', wage: 31, cardFace: '/assets/lineker-card.webp' },
  { id: 107, name: 'Butragueño', ovr: 122, pos: 'ST', nation: 'Tây Ban Nha', flag: 'ES', club: 'Madrid', tier: 'eternal', wage: 31, cardFace: '/assets/butragueno-card.webp' },
  { id: 108, name: 'G. Bale', ovr: 122, pos: 'LM', nation: 'Wales', flag: 'WL', club: 'Madrid', tier: 'eternal', wage: 31, cardFace: '/assets/bale-card.webp' },
  { id: 109, name: 'G. Hagi', ovr: 122, pos: 'CAM', nation: 'Romania', flag: 'RO', club: 'Galatasaray', tier: 'eternal', wage: 31, cardFace: '/assets/hagi-card.webp' },
  { id: 110, name: 'F. Ribéry', ovr: 122, pos: 'LW', nation: 'Pháp', flag: 'FR', club: 'Bayern', tier: 'eternal', wage: 31, cardFace: '/assets/ribery-card.webp' },
  { id: 111, name: 'G. Chiellini', ovr: 122, pos: 'CB', nation: 'Ý', flag: 'IT', club: 'Torino', tier: 'eternal', wage: 31, cardFace: '/assets/chiellini-card.webp' },
  { id: 112, name: 'H. Crespo', ovr: 122, pos: 'ST', nation: 'Argentina', flag: 'AR', club: 'Milano', tier: 'eternal', wage: 31, cardFace: '/assets/crespo-card.webp' },
  { id: 113, name: 'D. Trezeguet', ovr: 122, pos: 'ST', nation: 'Pháp', flag: 'FR', club: 'Torino', tier: 'eternal', wage: 31, cardFace: '/assets/trezeguet-card.webp' },
  { id: 114, name: 'H. Stoichkov', ovr: 122, pos: 'RW', nation: 'Bulgaria', flag: 'BG', club: 'Barcelona', tier: 'eternal', wage: 31, cardFace: '/assets/stoichkov-card.webp' },
  { id: 115, name: 'C. Seedorf', ovr: 122, pos: 'CAM', nation: 'Hà Lan', flag: 'NL', club: 'Milano', tier: 'eternal', wage: 31, cardFace: '/assets/seedorf-card.webp' },
  { id: 116, name: 'M. Desailly', ovr: 122, pos: 'CDM', nation: 'Pháp', flag: 'FR', club: 'Chelsea', tier: 'eternal', wage: 31, cardFace: '/assets/desailly-card.webp' },
  { id: 117, name: 'L. Blanc', ovr: 122, pos: 'CB', nation: 'Pháp', flag: 'FR', club: 'Manchester Đỏ', tier: 'eternal', wage: 30, cardFace: '/assets/blanc-card.webp' },
  { id: 118, name: 'Fernando Hierro', ovr: 122, pos: 'CB', nation: 'Tây Ban Nha', flag: 'ES', club: 'Madrid', tier: 'eternal', wage: 30, cardFace: '/assets/hierro-card.webp' },
  { id: 119, name: 'B. Schweinsteiger', ovr: 122, pos: 'CM', nation: 'Đức', flag: 'DE', club: 'Bayern', tier: 'eternal', wage: 30, cardFace: '/assets/schweinsteiger-card.webp' },
  { id: 120, name: 'C. Makélélé', ovr: 122, pos: 'CDM', nation: 'Pháp', flag: 'FR', club: 'Chelsea', tier: 'eternal', wage: 30, cardFace: '/assets/makelele-card.webp' },
  { id: 121, name: 'R. Keane', ovr: 122, pos: 'CDM', nation: 'Ireland', flag: 'IE', club: 'Manchester Đỏ', tier: 'eternal', wage: 30, cardFace: '/assets/keane-card.webp' },
  { id: 122, name: 'Rui Costa', ovr: 121, pos: 'CAM', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Milano', tier: 'eternal', wage: 30, cardFace: '/assets/ruicosta-card.webp' },
  { id: 11, name: 'Kylian Mbappé', ovr: 104, pos: 'ST', nation: 'Pháp', flag: 'FR', club: 'Paris', tier: 'stellar' },
  { id: 12, name: 'Erling Haaland', ovr: 104, pos: 'ST', nation: 'Na Uy', flag: 'NO', club: 'Manchester Xanh', tier: 'stellar' },
  { id: 13, name: 'Kevin De Bruyne', ovr: 103, pos: 'CM', nation: 'Bỉ', flag: 'BE', club: 'Manchester Xanh', tier: 'stellar' },
  { id: 14, name: 'Mohamed Salah', ovr: 102, pos: 'RW', nation: 'Ai Cập', flag: 'EG', club: 'Liverpool', tier: 'stellar' },
  { id: 15, name: 'Son Heung-min', ovr: 101, pos: 'LW', nation: 'Hàn Quốc', flag: 'KR', club: 'Tottenham', tier: 'stellar' },
  { id: 16, name: 'Jude Bellingham', ovr: 100, pos: 'CAM', nation: 'Anh', flag: 'EN', club: 'Madrid', tier: 'stellar' },
  { id: 17, name: 'Vinícius Júnior', ovr: 100, pos: 'LW', nation: 'Brazil', flag: 'BR', club: 'Madrid', tier: 'stellar' },
  { id: 18, name: 'Virgil van Dijk', ovr: 99, pos: 'CB', nation: 'Hà Lan', flag: 'NL', club: 'Liverpool', tier: 'stellar' },
  { id: 19, name: 'Luka Modrić', ovr: 97, pos: 'CM', nation: 'Croatia', flag: 'HR', club: 'Madrid', tier: 'stellar' },
  { id: 20, name: 'Alisson Becker', ovr: 95, pos: 'GK', nation: 'Brazil', flag: 'BR', club: 'Liverpool', tier: 'stellar' },
  { id: 21, name: 'Nguyễn Quang Hải', ovr: 94, pos: 'CAM', nation: 'Việt Nam', flag: 'VN', club: 'Hà Nội', tier: 'origin' },
  { id: 22, name: 'Nguyễn Tiến Linh', ovr: 92, pos: 'ST', nation: 'Việt Nam', flag: 'VN', club: 'Bình Dương', tier: 'origin' },
  { id: 23, name: 'Đỗ Hùng Dũng', ovr: 90, pos: 'CM', nation: 'Việt Nam', flag: 'VN', club: 'Hà Nội', tier: 'origin' },
  { id: 24, name: 'Đặng Văn Lâm', ovr: 89, pos: 'GK', nation: 'Việt Nam', flag: 'VN', club: 'Bình Định', tier: 'origin' },
  { id: 25, name: 'Takefusa Kubo', ovr: 93, pos: 'RW', nation: 'Nhật Bản', flag: 'JP', club: 'San Sebastián', tier: 'origin' },
  { id: 26, name: 'Lee Kang-in', ovr: 91, pos: 'CAM', nation: 'Hàn Quốc', flag: 'KR', club: 'Paris', tier: 'origin' },
  { id: 27, name: 'Kaoru Mitoma', ovr: 88, pos: 'LW', nation: 'Nhật Bản', flag: 'JP', club: 'Brighton', tier: 'origin' },
  { id: 28, name: 'Đoàn Văn Hậu', ovr: 86, pos: 'LB', nation: 'Việt Nam', flag: 'VN', club: 'Hà Nội', tier: 'origin' },
  { id: 29, name: 'Bùi Hoàng Việt Anh', ovr: 83, pos: 'CB', nation: 'Việt Nam', flag: 'VN', club: 'Hà Nội', tier: 'origin' },
  { id: 30, name: 'Nguyễn Hoàng Đức', ovr: 80, pos: 'CM', nation: 'Việt Nam', flag: 'VN', club: 'Thể Công', tier: 'origin' },
];
export const packs: Pack[] = [
  { id: 'eternal', name: 'ICONTM (ALL)', short: 'TM', price: 1500000, weights: [0, 0, 100], description: 'Nơi những huyền thoại trở lại.', range: '119–127', color: 'gold' },
  { id: 'stellar', name: 'Gói Tinh tú', short: 'TT', price: 500000, weights: [15, 70, 15], description: 'Tỏa sáng cùng những ngôi sao.', range: '80–127', color: 'blue' },
  { id: 'origin', name: 'Gói Khởi nguyên', short: 'KN', price: 100000, weights: [80, 18, 2], description: 'Khởi đầu một hành trình lớn.', range: '80–127', color: 'silver' },
];
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
export const getPlayer = (card: Card) => players.find(p => p.id === card.playerId)!;
export const ovr = (card: Card) => getPlayer(card).ovr + (levelOvrBonuses[card.level - 1] ?? 0);
export const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
export const uid = () => crypto.randomUUID();
export function random() { return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; }
export function makeCard(playerId: number): Card { return { uid: uid(), playerId, level: 1, received: Date.now() }; }
export function initialSave(): Save {
  return { version: 1, unopened: { eternal: 15, stellar: 15, origin: 15 }, balance: 15000000, cards: [11, 15, 21, 21, 22, 23, 24, 25, 26, 27, 28, 30].map(makeCard), history: [], daily: '', opened: 0, upgrades: 0, sound: false, reduced: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches };
}
export function draw(pack: Pack, rng = random): Card {
  const value = rng() * 100;
  const tier: Tier = value < pack.weights[0] ? 'origin' : value < pack.weights[0] + pack.weights[1] ? 'stellar' : 'eternal';
  const pool = players.filter(p => p.tier === tier);
  return makeCard(pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].id);
}
export const getPackStock = (state: Save, pack: Pack): number => state.unopened?.[pack.id] ?? 15;

export function openPacks(state: Save, pack: Pack, count: number, rng = random, free = false): { state: Save; cards: Card[] } {
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('Hãy chọn từ 1 đến 10 thẻ.');
  if (!free && state.balance < pack.price * count) throw new Error('Không đủ xu để mở gói này. Hãy nhận quà điểm danh hoặc chọn gói khác.');
  const available = getPackStock(state, pack);
  if (count > available) throw new Error(`Chỉ còn ${available} gói chưa mở. Hãy nhận thêm gói trước khi mở tiếp.`);
  const cards = Array.from({ length: count }, () => draw(pack, rng));
  const best = [...cards].sort((a, b) => ovr(b) - ovr(a))[0];
  const entry: Entry = { id: uid(), time: Date.now(), type: 'pack', title: `Mở ${count} ${pack.name.toLowerCase()}`, detail: `${getPlayer(best).name} · OVR ${ovr(best)} · ${free ? 'Thử nghiệm · Không trừ xu' : `−${money(pack.price * count)} xu`}` };
  return { state: { ...state, unopened: { eternal: 15, stellar: 15, origin: 15, ...state.unopened, [pack.id]: available - count }, balance: free ? state.balance : state.balance - pack.price * count, cards: [...cards, ...state.cards], history: [entry, ...state.history].slice(0, 200), opened: state.opened + count }, cards };
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
export function upgrade(state: Save, targetId: string, materialIds: string[], rng = random, free = false) {
  const target = state.cards.find(c => c.uid === targetId);
  if (!target || target.level >= MAX_LEVEL) throw new Error(`Chọn thẻ chính có cấp cộng dưới +${MAX_LEVEL}.`);
  if (materialIds.length < 1 || materialIds.length > 5 || new Set(materialIds).size !== materialIds.length || materialIds.includes(targetId)) throw new Error('Cần chọn từ 1 đến 5 thẻ nguyên liệu khác nhau.');
  const materials = materialIds.map(id => state.cards.find(c => c.uid === id));
  if (materials.some(c => !c)) throw new Error('Nguyên liệu không còn trong kho.');
  const selected = materials as Card[];
  const info = upgradeInfo(target, selected);
  if (!free && state.balance < info.cost) throw new Error('Bạn không đủ xu nâng cấp.');
  const success = rng() * 100 < info.chance;
  const droppedLevel = success ? null : 1 + Math.floor(rng() * Math.max(1, target.level - 1));
  const recoveryFloor = Math.max(0, ...selected.filter(card => card.playerId === target.playerId).map(card => card.level));
  const restoredLevel = droppedLevel !== null && recoveryFloor > droppedLevel ? recoveryFloor : null;
  const result = { ...target, level: success ? target.level + 1 : restoredLevel ?? droppedLevel! };
  const transition = restoredLevel !== null ? `+${target.level} → +${droppedLevel} → +${result.level} · Phục hồi bằng phôi trùng` : `+${target.level} → +${result.level}`;
  const entry: Entry = { id: uid(), time: Date.now(), type: 'upgrade', success, title: `${success ? 'Thành công' : 'Thất bại'} · ${getPlayer(target).name}`, detail: `${transition} · ${materials.length} nguyên liệu · ${free ? 'Thử nghiệm · Không trừ xu' : `−${money(info.cost)} xu`}` };
  return { state: { ...state, balance: free ? state.balance : state.balance - info.cost, cards: state.cards.filter(c => !materialIds.includes(c.uid)).map(c => c.uid === targetId ? result : c), history: [entry, ...state.history].slice(0, 200), upgrades: state.upgrades + 1 }, result, success, info, droppedLevel, restoredLevel };
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
  if (Array.isArray(s.cards)) for (const c of s.cards) if (c && retiredIcons[c.playerId]) c.playerId = retiredIcons[c.playerId];
  return s.version === 1 && Number.isSafeInteger(s.balance) && s.balance >= 0 && Array.isArray(s.cards) && s.cards.every(c => c && typeof c.uid === 'string' && players.some(p => p.id === c.playerId) && Number.isInteger(c.level) && c.level >= 1 && c.level <= MAX_LEVEL && Number.isFinite(c.received)) && new Set(s.cards.map(c => c.uid)).size === s.cards.length && Array.isArray(s.history) && s.history.every(e => e && typeof e.id === 'string' && Number.isFinite(e.time) && ['pack', 'upgrade', 'gift', 'market'].includes(e.type) && typeof e.title === 'string' && typeof e.detail === 'string') && typeof s.daily === 'string' && Number.isSafeInteger(s.opened) && s.opened >= 0 && Number.isSafeInteger(s.upgrades) && s.upgrades >= 0 && typeof s.sound === 'boolean' && typeof s.reduced === 'boolean' && (s.quick === undefined || typeof s.quick === 'boolean') && (s.light === undefined || typeof s.light === 'boolean') && (s.unopened === undefined || (!!s.unopened && typeof s.unopened === 'object' && !Array.isArray(s.unopened) && packs.every(p => Number.isSafeInteger(s.unopened![p.id]) && s.unopened![p.id] >= 0)));
}
