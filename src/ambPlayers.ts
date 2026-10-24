import { asset } from './asset';
import type { Player } from './game';

// 9 thẻ mùa FC AMBASSADOR từ ảnh người dùng cung cấp; chưa gán giá giao dịch.
// Logo đội theo logo CLB in ở góc dưới phải mỗi thẻ; CLB chưa có trong clubLogos.json dùng logo cắt từ thẻ.
export const ambPlayers: Player[] = [
  { id: 483, name: "V. van Dijk", ovr: 112, pos: 'CB', nation: 'Hà Lan', flag: 'NL', club: 'Liverpool', tier: 'amb', wage: 28, cardFace: asset('/assets/amb-v-van-dijk-card.webp') },
  { id: 484, name: "Y. Moukoko", ovr: 106, pos: 'ST', nation: 'Đức', flag: 'DE', club: 'FC Copenhagen', tier: 'amb', wage: 23, cardFace: asset('/assets/amb-y-moukoko-card.webp'), teamLogo: asset('/assets/clubs/fc-copenhagen.png') },
  { id: 485, name: "H. Son", ovr: 111, pos: 'LW', nation: 'Hàn Quốc', flag: 'KR', club: 'LAFC', tier: 'amb', wage: 27, cardFace: asset('/assets/amb-h-son-card.webp') },
  { id: 486, name: "F. Chiesa", ovr: 109, pos: 'LW', nation: 'Ý', flag: 'IT', club: 'Liverpool', tier: 'amb', wage: 26, cardFace: asset('/assets/amb-f-chiesa-card.webp') },
  { id: 487, name: "J. Grealish", ovr: 109, pos: 'LW', nation: 'Anh', flag: 'EN', club: 'Everton', tier: 'amb', wage: 25, cardFace: asset('/assets/amb-j-grealish-card.webp'), teamLogo: asset('/assets/clubs/everton.png') },
  { id: 488, name: "E. Fernández", ovr: 108, pos: 'CM', nation: 'Argentina', flag: 'AR', club: 'Chelsea', tier: 'amb', wage: 24, cardFace: asset('/assets/amb-e-fernandez-card.webp') },
  { id: 489, name: "Vini Jr.", ovr: 111, pos: 'LW', nation: 'Brazil', flag: 'BR', club: 'Madrid', tier: 'amb', wage: 26, cardFace: asset('/assets/amb-vini-jr-card.webp') },
  { id: 490, name: "J. Bellingham", ovr: 112, pos: 'CM', nation: 'Anh', flag: 'EN', club: 'Madrid', tier: 'amb', wage: 26, cardFace: asset('/assets/amb-j-bellingham-card.webp') },
  { id: 491, name: "E. Haaland", ovr: 112, pos: 'ST', nation: 'Na Uy', flag: 'NO', club: 'Manchester Xanh', tier: 'amb', wage: 27, cardFace: asset('/assets/amb-e-haaland-card.webp') },
];
