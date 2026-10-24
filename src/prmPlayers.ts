import { asset } from './asset';
import type { Player } from './game';

// 20 thẻ mùa PRIME từ ảnh người dùng cung cấp; chưa gán giá giao dịch.
// Logo đội theo logo in ở góc dưới phải mỗi thẻ: thẻ có khiên phượng hoàng dùng logo PRIME, còn lại dùng logo CLB.
const prmLogo = asset('/assets/prm-team.png');
export const prmPlayers: Player[] = [
  { id: 423, name: "Nguyễn Quang Hải", ovr: 119, pos: 'RW', nation: 'Việt Nam', flag: 'VN', club: 'Việt Nam', tier: 'prm', wage: 30, cardFace: asset('/assets/prm-nguyen-quang-hai-card.webp'), teamLogo: prmLogo },
  { id: 424, name: "L. Suárez", ovr: 125, pos: 'ST', nation: 'Uruguay', flag: 'UY', club: 'Inter Miami', tier: 'prm', wage: 34, cardFace: asset('/assets/prm-l-suarez-card.webp') },
  { id: 425, name: "Maicon", ovr: 124, pos: 'RB', nation: 'Brazil', flag: 'BR', club: 'Inter', tier: 'prm', wage: 31, cardFace: asset('/assets/prm-maicon-card.webp'), teamLogo: prmLogo },
  { id: 426, name: "E. Hazard", ovr: 124, pos: 'LW', nation: 'Bỉ', flag: 'BE', club: 'Chelsea', tier: 'prm', wage: 33, cardFace: asset('/assets/prm-e-hazard-card.webp'), teamLogo: prmLogo },
  { id: 427, name: "M. Reus", ovr: 124, pos: 'CAM', nation: 'Đức', flag: 'DE', club: 'LA Galaxy', tier: 'prm', wage: 33, cardFace: asset('/assets/prm-m-reus-card.webp') },
  { id: 428, name: "Lúcio", ovr: 124, pos: 'CB', nation: 'Brazil', flag: 'BR', club: 'Inter', tier: 'prm', wage: 32, cardFace: asset('/assets/prm-lucio-card.webp'), teamLogo: prmLogo },
  { id: 429, name: "D. Forlán", ovr: 124, pos: 'ST', nation: 'Uruguay', flag: 'UY', club: 'Atlético', tier: 'prm', wage: 33, cardFace: asset('/assets/prm-d-forlan-card.webp'), teamLogo: prmLogo },
  { id: 430, name: "C. Tévez", ovr: 123, pos: 'ST', nation: 'Argentina', flag: 'AR', club: 'Manchester Xanh', tier: 'prm', wage: 32, cardFace: asset('/assets/prm-c-tevez-card.webp'), teamLogo: prmLogo },
  { id: 431, name: "João Cancelo", ovr: 123, pos: 'LB', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Al Hilal', tier: 'prm', wage: 30, cardFace: asset('/assets/prm-joao-cancelo-card.webp') },
  { id: 432, name: "Guti", ovr: 123, pos: 'CAM', nation: 'Tây Ban Nha', flag: 'ES', club: 'Madrid', tier: 'prm', wage: 32, cardFace: asset('/assets/prm-guti-card.webp'), teamLogo: prmLogo },
  { id: 433, name: "Nguyễn Xuân Son", ovr: 120, pos: 'ST', nation: 'Việt Nam', flag: 'VN', club: 'Việt Nam', tier: 'prm', wage: 30, cardFace: asset('/assets/prm-nguyen-xuan-son-card.webp'), teamLogo: prmLogo },
  { id: 434, name: "Nguyễn Công Phượng", ovr: 119, pos: 'CF', nation: 'Việt Nam', flag: 'VN', club: 'Việt Nam', tier: 'prm', wage: 29, cardFace: asset('/assets/prm-nguyen-cong-phuong-card.webp'), teamLogo: prmLogo },
  { id: 435, name: "Lê Huỳnh Đức", ovr: 122, pos: 'ST', nation: 'Việt Nam', flag: 'VN', club: 'Việt Nam', tier: 'prm', wage: 31, cardFace: asset('/assets/prm-le-huynh-duc-card.webp'), teamLogo: prmLogo },
  { id: 436, name: "Nguyễn Hoàng Đức", ovr: 121, pos: 'CM', nation: 'Việt Nam', flag: 'VN', club: 'Việt Nam', tier: 'prm', wage: 31, cardFace: asset('/assets/prm-nguyen-hoang-duc-card.webp'), teamLogo: prmLogo },
  { id: 437, name: "T. Müller", ovr: 124, pos: 'CF', nation: 'Đức', flag: 'DE', club: 'Vancouver Whitecaps', tier: 'prm', wage: 33, cardFace: asset('/assets/prm-t-muller-card.webp') },
  { id: 438, name: "H. Son", ovr: 124, pos: 'LW', nation: 'Hàn Quốc', flag: 'KR', club: 'LAFC', tier: 'prm', wage: 33, cardFace: asset('/assets/prm-h-son-card.webp') },
  { id: 439, name: "S. Mané", ovr: 124, pos: 'LW', nation: 'Senegal', flag: 'SN', club: 'Al Nassr', tier: 'prm', wage: 33, cardFace: asset('/assets/prm-s-mane-card.webp') },
  { id: 440, name: "K. Benzema", ovr: 125, pos: 'CF', nation: 'Pháp', flag: 'FR', club: 'Al Ittihad', tier: 'prm', wage: 34, cardFace: asset('/assets/prm-k-benzema-card.webp') },
  { id: 441, name: "Cristiano Ronaldo", ovr: 126, pos: 'ST', nation: 'Bồ Đào Nha', flag: 'PT', club: 'Al Nassr', tier: 'prm', wage: 35, cardFace: asset('/assets/prm-cristiano-ronaldo-card.webp') },
  { id: 442, name: "L. Messi", ovr: 126, pos: 'CAM', nation: 'Argentina', flag: 'AR', club: 'Inter Miami', tier: 'prm', wage: 35, cardFace: asset('/assets/prm-l-messi-card.webp') },
];
