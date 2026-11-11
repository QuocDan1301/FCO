import logos from './clubLogos.json';
import { asset } from './asset';

// Logo CLB người chơi tự chọn (ảnh đại diện HLV + logo đội GLXH, migration 202611120004): khoá = tên CLB trong src/clubLogos.json.
const map = logos as Record<string, string>;
export const CLUB_NAMES: readonly string[] = Object.keys(map).sort((a, b) => a.localeCompare(b, 'vi'));
export const clubLogoUrl = (club: string | null | undefined) => club && map[club] ? asset(map[club]) : null;
