// In mã dữ liệu kho thẻ (SHA-256 của bộ dữ liệu game) — vite.config.ts gọi lúc build để gắn cố định vào game.
import { computeCatalogVersion } from '../src/inventory-catalog';
process.stdout.write(await computeCatalogVersion());
