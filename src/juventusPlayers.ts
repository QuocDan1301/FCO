import type { Player } from './game';
import { asset } from './asset';

// JUVENTUS source order and +1 prices: scripts/data/juventus.csv.
export const juventusPlayers: Player[] = [
  { id: 3723, name: "Z. Zidane", ovr: 114, pos: "CAM", nation: "Pháp", flag: "FR", club: "Juventus", tier: "juventus", wage: 29, cardFace: asset("/assets/juventus-3723-card.webp"), teamLogo: asset("/assets/clubs/111.webp") },
  { id: 3724, name: "R. Baggio", ovr: 114, pos: "CF", nation: "Ý", flag: "IT", club: "Juventus", tier: "juventus", wage: 28, cardFace: asset("/assets/juventus-3724-card.webp"), teamLogo: asset("/assets/clubs/111.webp") },
  { id: 3725, name: "A. Del Piero", ovr: 113, pos: "CF", nation: "Ý", flag: "IT", club: "Juventus", tier: "juventus", wage: 28, cardFace: asset("/assets/juventus-3725-card.webp"), teamLogo: asset("/assets/clubs/111.webp") },
  { id: 3726, name: "P. Nedvěd", ovr: 113, pos: "CAM", nation: "Séc", flag: "CZ", club: "Juventus", tier: "juventus", wage: 27, cardFace: asset("/assets/juventus-3726-card.webp"), teamLogo: asset("/assets/clubs/111.webp") },
  { id: 3727, name: "A. Pirlo", ovr: 112, pos: "CM", nation: "Ý", flag: "IT", club: "Juventus", tier: "juventus", wage: 27, cardFace: asset("/assets/juventus-3727-card.webp"), teamLogo: asset("/assets/clubs/111.webp") },
  { id: 3728, name: "D. Trezeguet", ovr: 112, pos: "ST", nation: "Pháp", flag: "FR", club: "Juventus", tier: "juventus", wage: 27, cardFace: asset("/assets/juventus-3728-card.webp"), teamLogo: asset("/assets/clubs/111.webp") },
  { id: 3729, name: "G. Zambrotta", ovr: 111, pos: "LB", nation: "Ý", flag: "IT", club: "Juventus", tier: "juventus", wage: 26, cardFace: asset("/assets/juventus-3729-card.webp"), teamLogo: asset("/assets/clubs/111.webp") },
  { id: 3730, name: "C. Marchisio", ovr: 111, pos: "CM", nation: "Ý", flag: "IT", club: "Juventus", tier: "juventus", wage: 25, cardFace: asset("/assets/juventus-3730-card.webp"), teamLogo: asset("/assets/clubs/111.webp") },
  { id: 3731, name: "J. Kohler", ovr: 110, pos: "CB", nation: "Đức", flag: "DE", club: "Juventus", tier: "juventus", wage: 25, cardFace: asset("/assets/juventus-3731-card.webp"), teamLogo: asset("/assets/clubs/111.webp") },
  { id: 3732, name: "Alex Sandro", ovr: 110, pos: "LB", nation: "Brazil", flag: "BR", club: "Tự do", tier: "juventus", wage: 25, cardFace: asset("/assets/juventus-3732-card.webp"), teamLogo: asset("/assets/juventus-team.webp") },
  { id: 3733, name: "Danilo", ovr: 109, pos: "RB", nation: "Brazil", flag: "BR", club: "Tự do", tier: "juventus", wage: 25, cardFace: asset("/assets/juventus-3733-card.webp"), teamLogo: asset("/assets/juventus-team.webp") },
  { id: 3734, name: "A. Rabiot", ovr: 109, pos: "CM", nation: "Pháp", flag: "FR", club: "Marseille", tier: "juventus", wage: 24, cardFace: asset("/assets/juventus-3734-card.webp"), teamLogo: asset("/assets/clubs/176.webp") },
  { id: 3735, name: "W. Szczęsny", ovr: 109, pos: "GK", nation: "Ba Lan", flag: "PL", club: "Barcelona", tier: "juventus", wage: 22, cardFace: asset("/assets/juventus-3735-card.webp"), teamLogo: asset("/assets/clubs/83.webp") },
  { id: 3736, name: "M. De Sciglio", ovr: 108, pos: "RB", nation: "Ý", flag: "IT", club: "Juventus", tier: "juventus", wage: 24, cardFace: asset("/assets/juventus-3736-card.webp"), teamLogo: asset("/assets/clubs/111.webp") },
];
