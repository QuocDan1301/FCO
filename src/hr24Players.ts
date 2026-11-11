import type { Player } from './game';
import { asset } from './asset';

// Thứ tự theo scripts/data/hr24.csv; tạo bởi scripts/import-hr24.py.
export const hr24Players: Player[] = [
  { id: 3928, name: "G. Vialli", ovr: 114, pos: "ST", nation: "Ý", flag: "IT", club: "Tự do", tier: "hr24", wage: 28, cardFace: asset("/assets/hr24-3928-card.webp"), teamLogo: asset("/assets/hr24-team.webp") },
  { id: 3929, name: "W. Sneijder", ovr: 113, pos: "CAM", nation: "Hà Lan", flag: "NL", club: "Tự do", tier: "hr24", wage: 27, cardFace: asset("/assets/hr24-3929-card.webp"), teamLogo: asset("/assets/hr24-team.webp") },
  { id: 3930, name: "V. Kompany", ovr: 113, pos: "CB", nation: "Bỉ", flag: "BE", club: "Tự do", tier: "hr24", wage: 27, cardFace: asset("/assets/hr24-3930-card.webp"), teamLogo: asset("/assets/hr24-team.webp") },
  { id: 3931, name: "E. Francescoli", ovr: 112, pos: "CF", nation: "Uruguay", flag: "UY", club: "Tự do", tier: "hr24", wage: 27, cardFace: asset("/assets/hr24-3931-card.webp"), teamLogo: asset("/assets/hr24-team.webp") },
  { id: 3932, name: "C. Tévez", ovr: 112, pos: "ST", nation: "Argentina", flag: "AR", club: "Tự do", tier: "hr24", wage: 27, cardFace: asset("/assets/hr24-3932-card.webp"), teamLogo: asset("/assets/hr24-team.webp") },
  { id: 3933, name: "D. Berbatov", ovr: 112, pos: "ST", nation: "Bulgaria", flag: "BG", club: "Tự do", tier: "hr24", wage: 27, cardFace: asset("/assets/hr24-3933-card.webp"), teamLogo: asset("/assets/hr24-team.webp") },
  { id: 3934, name: "S. McManaman", ovr: 111, pos: "LM", nation: "Anh", flag: "EN", club: "Tự do", tier: "hr24", wage: 26, cardFace: asset("/assets/hr24-3934-card.webp"), teamLogo: asset("/assets/hr24-team.webp") },
  { id: 3935, name: "B. Lizarazu", ovr: 111, pos: "LB", nation: "Pháp", flag: "FR", club: "Tự do", tier: "hr24", wage: 25, cardFace: asset("/assets/hr24-3935-card.webp"), teamLogo: asset("/assets/hr24-team.webp") },
  { id: 3936, name: "T. Rosický", ovr: 110, pos: "CAM", nation: "Séc", flag: "CZ", club: "Tự do", tier: "hr24", wage: 26, cardFace: asset("/assets/hr24-3936-card.webp"), teamLogo: asset("/assets/hr24-team.webp") },
  { id: 3937, name: "L. Giuly", ovr: 110, pos: "RW", nation: "Pháp", flag: "FR", club: "Tự do", tier: "hr24", wage: 26, cardFace: asset("/assets/hr24-3937-card.webp"), teamLogo: asset("/assets/hr24-team.webp") },
  { id: 3938, name: "J. Riise", ovr: 110, pos: "LB", nation: "Na Uy", flag: "NO", club: "Tự do", tier: "hr24", wage: 25, cardFace: asset("/assets/hr24-3938-card.webp"), teamLogo: asset("/assets/hr24-team.webp") },
  { id: 3939, name: "Ramires", ovr: 110, pos: "CDM", nation: "Brazil", flag: "BR", club: "Tự do", tier: "hr24", wage: 25, cardFace: asset("/assets/hr24-3939-card.webp"), teamLogo: asset("/assets/hr24-team.webp") },
  { id: 3940, name: "N. Kanu", ovr: 109, pos: "CF", nation: "Nigeria", flag: "NG", club: "Tự do", tier: "hr24", wage: 25, cardFace: asset("/assets/hr24-3940-card.webp"), teamLogo: asset("/assets/hr24-team.webp") },
  { id: 3941, name: "D. Beasley", ovr: 108, pos: "LW", nation: "Mỹ", flag: "US", club: "Tự do", tier: "hr24", wage: 25, cardFace: asset("/assets/hr24-3941-card.webp"), teamLogo: asset("/assets/hr24-team.webp") },
];
