import type { Player } from './game';
import { asset } from './asset';

// Thứ tự theo scripts/data/ld.csv; tạo bởi scripts/import-ld.py.
export const ldPlayers: Player[] = [
  { id: 3968, name: "K. Benzema", ovr: 115, pos: "CF", nation: "Pháp", flag: "FR", club: "Tự do", tier: "ld", wage: 29, cardFace: asset("/assets/ld-3968-card.webp"), teamLogo: asset("/assets/ld-team.webp") },
  { id: 3969, name: "Sergio Ramos", ovr: 115, pos: "CB", nation: "Tây Ban Nha", flag: "ES", club: "Tự do", tier: "ld", wage: 29, cardFace: asset("/assets/ld-3969-card.webp"), teamLogo: asset("/assets/ld-team.webp") },
  { id: 3970, name: "L. Modrić", ovr: 115, pos: "CM", nation: "Croatia", flag: "HR", club: "Milano", tier: "ld", wage: 28, cardFace: asset("/assets/ld-3970-card.webp"), teamLogo: asset("/assets/clubs/103.webp") },
  { id: 3971, name: "M. Neuer", ovr: 115, pos: "GK", nation: "Đức", flag: "DE", club: "Bayern", tier: "ld", wage: 26, cardFace: asset("/assets/ld-3971-card.webp"), teamLogo: asset("/assets/clubs/132.webp") },
  { id: 3972, name: "E. Cavani", ovr: 114, pos: "ST", nation: "Uruguay", flag: "UY", club: "Tự do", tier: "ld", wage: 28, cardFace: asset("/assets/ld-3972-card.webp"), teamLogo: asset("/assets/ld-team.webp") },
  { id: 3973, name: "Thiago Silva", ovr: 114, pos: "CB", nation: "Brazil", flag: "BR", club: "Tự do", tier: "ld", wage: 27, cardFace: asset("/assets/ld-3973-card.webp"), teamLogo: asset("/assets/ld-team.webp") },
  { id: 3974, name: "L. Bonucci", ovr: 113, pos: "CB", nation: "Ý", flag: "IT", club: "Tự do", tier: "ld", wage: 27, cardFace: asset("/assets/ld-3974-card.webp"), teamLogo: asset("/assets/ld-team.webp") },
  { id: 3975, name: "Pepe", ovr: 113, pos: "CB", nation: "Bồ Đào Nha", flag: "PT", club: "Tự do", tier: "ld", wage: 27, cardFace: asset("/assets/ld-3975-card.webp"), teamLogo: asset("/assets/ld-team.webp") },
  { id: 3976, name: "E. Džeko", ovr: 112, pos: "ST", nation: "Bosnia và Herzegovina", flag: "BA", club: "Schalke", tier: "ld", wage: 27, cardFace: asset("/assets/ld-3976-card.webp"), teamLogo: asset("/assets/clubs/133.webp") },
  { id: 3977, name: "O. Giroud", ovr: 112, pos: "ST", nation: "Pháp", flag: "FR", club: "Lille", tier: "ld", wage: 27, cardFace: asset("/assets/ld-3977-card.webp"), teamLogo: asset("/assets/clubs/166.webp") },
  { id: 3978, name: "Falcao", ovr: 112, pos: "ST", nation: "Colombia", flag: "CO", club: "Tự do", tier: "ld", wage: 27, cardFace: asset("/assets/ld-3978-card.webp"), teamLogo: asset("/assets/ld-team.webp") },
  { id: 3979, name: "Santi Cazorla", ovr: 112, pos: "CM", nation: "Tây Ban Nha", flag: "ES", club: "Tự do", tier: "ld", wage: 27, cardFace: asset("/assets/ld-3979-card.webp"), teamLogo: asset("/assets/ld-team.webp") },
  { id: 3980, name: "D. Mertens", ovr: 112, pos: "CF", nation: "Bỉ", flag: "BE", club: "Tự do", tier: "ld", wage: 26, cardFace: asset("/assets/ld-3980-card.webp"), teamLogo: asset("/assets/ld-team.webp") },
  { id: 3981, name: "Jesús Navas", ovr: 111, pos: "RB", nation: "Tây Ban Nha", flag: "ES", club: "Tự do", tier: "ld", wage: 26, cardFace: asset("/assets/ld-3981-card.webp"), teamLogo: asset("/assets/ld-team.webp") },
  { id: 3982, name: "J. Milner", ovr: 111, pos: "CM", nation: "Anh", flag: "EN", club: "Tự do", tier: "ld", wage: 26, cardFace: asset("/assets/ld-3982-card.webp"), teamLogo: asset("/assets/ld-team.webp") },
  { id: 3983, name: "A. Young", ovr: 110, pos: "RB", nation: "Anh", flag: "EN", club: "Tự do", tier: "ld", wage: 25, cardFace: asset("/assets/ld-3983-card.webp"), teamLogo: asset("/assets/ld-team.webp") },
];
