import type { Player } from './game';
import { asset } from './asset';

// Thứ tự theo scripts/data/hr26.csv; tạo bởi scripts/import-hr26.py.
export const hr26Players: Player[] = [
  { id: 3959, name: "Iván Zamorano", ovr: 122, pos: "ST", nation: "Chile", flag: "CL", club: "Tự do", tier: "hr26", wage: 32, cardFace: asset("/assets/hr26-3959-card.webp"), teamLogo: asset("/assets/hr26-team.webp") },
  { id: 3960, name: "Roy Makaay", ovr: 122, pos: "ST", nation: "Hà Lan", flag: "NL", club: "Tự do", tier: "hr26", wage: 32, cardFace: asset("/assets/hr26-3960-card.webp"), teamLogo: asset("/assets/hr26-team.webp") },
  { id: 3961, name: "D. De Rossi", ovr: 122, pos: "CDM", nation: "Ý", flag: "IT", club: "Tự do", tier: "hr26", wage: 31, cardFace: asset("/assets/hr26-3961-card.webp"), teamLogo: asset("/assets/hr26-team.webp") },
  { id: 3962, name: "Ulrich Hoeneß", ovr: 120, pos: "LM", nation: "Đức", flag: "DE", club: "Tự do", tier: "hr26", wage: 31, cardFace: asset("/assets/hr26-3962-card.webp"), teamLogo: asset("/assets/hr26-team.webp") },
  { id: 3963, name: "C. Pizarro", ovr: 120, pos: "ST", nation: "Peru", flag: "PE", club: "Tự do", tier: "hr26", wage: 31, cardFace: asset("/assets/hr26-3963-card.webp"), teamLogo: asset("/assets/hr26-team.webp") },
  { id: 3964, name: "M. Salgado", ovr: 120, pos: "RB", nation: "Tây Ban Nha", flag: "ES", club: "Tự do", tier: "hr26", wage: 30, cardFace: asset("/assets/hr26-3964-card.webp"), teamLogo: asset("/assets/hr26-team.webp") },
  { id: 3965, name: "Quaresma", ovr: 119, pos: "RW", nation: "Bồ Đào Nha", flag: "PT", club: "Tự do", tier: "hr26", wage: 30, cardFace: asset("/assets/hr26-3965-card.webp"), teamLogo: asset("/assets/hr26-team.webp") },
  { id: 3966, name: "P. Aimar", ovr: 119, pos: "CAM", nation: "Argentina", flag: "AR", club: "Tự do", tier: "hr26", wage: 30, cardFace: asset("/assets/hr26-3966-card.webp"), teamLogo: asset("/assets/hr26-team.webp") },
  { id: 3967, name: "M. Richards", ovr: 118, pos: "RB", nation: "Anh", flag: "EN", club: "Tự do", tier: "hr26", wage: 30, cardFace: asset("/assets/hr26-3967-card.webp"), teamLogo: asset("/assets/hr26-team.webp") },
];
