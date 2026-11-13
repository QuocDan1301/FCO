import type { Player } from './game';
import { asset } from './asset';

// Thứ tự theo scripts/data/tsubasa.csv; tạo bởi scripts/import-tsubasa.py.
export const tsubasaPlayers: Player[] = [
  { id: 4177, name: "Pelé", ovr: 130, pos: "ST", nation: "Brazil", flag: "BR", club: "Tự do", tier: "tsubasa", wage: 36, cardFace: asset("/assets/tsubasa-4177-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4178, name: "Ronaldinho", ovr: 129, pos: "LW", nation: "Brazil", flag: "BR", club: "Tự do", tier: "tsubasa", wage: 35, cardFace: asset("/assets/tsubasa-4178-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4179, name: "Casillas", ovr: 129, pos: "GK", nation: "Tây Ban Nha", flag: "ES", club: "Tự do", tier: "tsubasa", wage: 31, cardFace: asset("/assets/tsubasa-4179-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4180, name: "Zico", ovr: 128, pos: "CF", nation: "Brazil", flag: "BR", club: "Tự do", tier: "tsubasa", wage: 35, cardFace: asset("/assets/tsubasa-4180-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4181, name: "P. Nedvěd", ovr: 128, pos: "CAM", nation: "Séc", flag: "CZ", club: "Tự do", tier: "tsubasa", wage: 35, cardFace: asset("/assets/tsubasa-4181-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4182, name: "Rivaldo", ovr: 128, pos: "LW", nation: "Brazil", flag: "BR", club: "Tự do", tier: "tsubasa", wage: 35, cardFace: asset("/assets/tsubasa-4182-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4183, name: "P. Maldini", ovr: 128, pos: "LB", nation: "Ý", flag: "IT", club: "Tự do", tier: "tsubasa", wage: 35, cardFace: asset("/assets/tsubasa-4183-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4184, name: "Iniesta", ovr: 128, pos: "CM", nation: "Tây Ban Nha", flag: "ES", club: "Tự do", tier: "tsubasa", wage: 34, cardFace: asset("/assets/tsubasa-4184-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4185, name: "Z. Ibrahimović", ovr: 127, pos: "ST", nation: "Thụy Điển", flag: "SE", club: "Tự do", tier: "tsubasa", wage: 36, cardFace: asset("/assets/tsubasa-4185-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4186, name: "A. Pirlo", ovr: 127, pos: "CM", nation: "Ý", flag: "IT", club: "Tự do", tier: "tsubasa", wage: 35, cardFace: asset("/assets/tsubasa-4186-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4187, name: "N. Vidić", ovr: 127, pos: "CB", nation: "Serbia", flag: "RS", club: "Tự do", tier: "tsubasa", wage: 34, cardFace: asset("/assets/tsubasa-4187-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4188, name: "R. van Nistelrooy", ovr: 127, pos: "ST", nation: "Hà Lan", flag: "NL", club: "Tự do", tier: "tsubasa", wage: 34, cardFace: asset("/assets/tsubasa-4188-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4189, name: "J. Stam", ovr: 126, pos: "CB", nation: "Hà Lan", flag: "NL", club: "Tự do", tier: "tsubasa", wage: 33, cardFace: asset("/assets/tsubasa-4189-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4190, name: "J. Zanetti", ovr: 126, pos: "RB", nation: "Argentina", flag: "AR", club: "Tự do", tier: "tsubasa", wage: 33, cardFace: asset("/assets/tsubasa-4190-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4191, name: "Rui Costa", ovr: 125, pos: "CAM", nation: "Bồ Đào Nha", flag: "PT", club: "Tự do", tier: "tsubasa", wage: 33, cardFace: asset("/assets/tsubasa-4191-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4192, name: "G. Gattuso", ovr: 125, pos: "CDM", nation: "Ý", flag: "IT", club: "Tự do", tier: "tsubasa", wage: 32, cardFace: asset("/assets/tsubasa-4192-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4193, name: "L. Giuly", ovr: 124, pos: "RW", nation: "Pháp", flag: "FR", club: "Tự do", tier: "tsubasa", wage: 33, cardFace: asset("/assets/tsubasa-4193-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
  { id: 4194, name: "F. Ljungberg", ovr: 124, pos: "RM", nation: "Thụy Điển", flag: "SE", club: "Tự do", tier: "tsubasa", wage: 32, cardFace: asset("/assets/tsubasa-4194-card.webp"), teamLogo: asset("/assets/tsubasa-team.webp") },
];
