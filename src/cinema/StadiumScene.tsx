import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { CAMERA_HOLD, cameraPose, cameraProgress, GATE_CROSS, gateZ, INFO_GAP, OPENING_CUES, STAGE_Z, TUNNEL_EXTRA, TUNNEL_TAIL } from './timeline';
import { drawBadge, drawWorldInfo, infoVisibility } from './sceneBadge';
import { FLAME_REF_DISTANCE, FLAME_X, FLAME_Y, FLAME_Z } from './flames';
import type { FlamePlacement } from './flames';
import { placeFlames } from './PackFlames';

// Hình học hầm gồm cả đoạn nối sau chỗ camera ra hầm (TUNNEL_TAIL).
const EXTRA = TUNNEL_EXTRA + TUNNEL_TAIL;

type Props = { phase: number; quick: boolean; nation: string; position: string; team: string; season: string; flag: string; teamLogo?: string; back?: string; intro?: string; accent?: string; stage?: { top: string; ring: string; led?: string }; onFallback: () => void; onReady: () => void; onPrepared?: () => void; playing?: boolean; getElapsed?: () => number; flames?: { current: HTMLDivElement | null } };

export default function StadiumScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef(props); state.current = props;
  // Vòng vẽ tự ngủ khi không còn gì để vẽ (chưa chạy / màn kết quả đã che cảnh); mỗi lần props đổi thì đánh thức lại.
  // Không giữ requestAnimationFrame chạy không: một callback rAF mỗi khung buộc luồng chính dựng khung và tính lại style
  // của mọi hoạt cảnh CSS đang chạy trên màn kết quả (pháo hoa, máy phun…), dù các hoạt cảnh đó vốn chỉ cần compositor.
  const wake = useRef<() => void>(() => {});
  useEffect(() => { wake.current(); });
  useEffect(() => {
    let dispose: (() => void) | undefined;
    const launch = window.setTimeout(() => { dispose = build(); }, 320);
    const build = () => {
    const container = host.current;
    if (!container) return;
    const touchPhone = matchMedia('(pointer: coarse) and (max-width: 900px)').matches;
    let mobile = touchPhone || matchMedia('(max-width: 700px)').matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance', alpha: false });
    } catch { state.current.onFallback(); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
    // Shader đều là shader dựng sẵn của three.js: bỏ kiểm tra lỗi biên dịch (mỗi shader lần đầu dùng phải chờ GPU trả log, gây khựng).
    renderer.debug.checkShaderErrors = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#03070c');
    // Trước khi xuyên qua vùng sáng ở cửa hầm, sương đen dày nuốt cả hầm (vùng sáng có fog: false nên vẫn hiện); qua rồi sương tan dần.
    const DARK_FOG = .45, CLEAR_FOG = .018;
    const fog = new THREE.FogExp2('#03070c', DARK_FOG); scene.fog = fog;
    const camera = new THREE.PerspectiveCamera(mobile ? 62 : 54, 1, .15, 230);
    const metal = new THREE.MeshStandardMaterial({ color: '#2b3949', metalness: .4, roughness: .42 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: '#172333', metalness: .25, roughness: .65 });
    const trim = new THREE.MeshStandardMaterial({ color: '#a89a77', metalness: .8, roughness: .28 });
    const lightColor = new THREE.Color('#f1dba3');
    const textures = new Set<THREE.Texture>();
    const geometries = new Set<THREE.BufferGeometry>();
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1); geometries.add(boxGeometry);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material = metal, parent: THREE.Object3D = scene) => {
      const mesh = new THREE.Mesh(boxGeometry, material); mesh.scale.set(w, h, d); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    };
    const basic = (color: string, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false, depthWrite: opacity >= 1 });
    scene.add(new THREE.HemisphereLight('#b4cada', '#070b10', 1.2));
    const ambient = new THREE.AmbientLight('#b9c9d6', .08); scene.add(ambient);
    const stageLight = new THREE.PointLight('#ffe5ae', 90, 45, 1.3); stageLight.position.set(0, 9, STAGE_Z + 2); scene.add(stageLight);
    const cameraLight = new THREE.PointLight('#d4eaff', 32, 25, 1.4); scene.add(cameraLight);
    const spotlight = new THREE.SpotLight('#fff2d2', 250, 65, Math.PI / 4, .6, 1.5); spotlight.position.set(0, 12, STAGE_Z + 7); spotlight.target.position.set(0, 2, STAGE_Z); spotlight.castShadow = false; spotlight.shadow.mapSize.set(512, 512); scene.add(spotlight, spotlight.target);

    // Vách, trần và từng nhịp khung là hình học độc lập để camera thực sự đi xuyên qua.
    box(.5, 7.6, 55 + EXTRA, -5.3, 3.8, -10.5 - EXTRA / 2, darkMetal); box(.5, 7.6, 55 + EXTRA, 5.3, 3.8, -10.5 - EXTRA / 2, darkMetal);
    box(11, .35, 55 + EXTRA, 0, 7.65, -10.5 - EXTRA / 2, darkMetal);
    const ribs: { material: THREE.MeshBasicMaterial; z: number; brightness: number }[] = [];
    let lastRibZ = 15;
    for (let i = 0; i < 13 + EXTRA / 4; i++) {
      const z = 15 - i * 4; lastRibZ = z;
      const led = basic('#efdbad'); led.color.multiplyScalar(.015); ribs.push({ material: led, z, brightness: .015 });
      for (const x of [-5, 5]) {
        box(.26, 7.3, .25, x, 3.65, z); box(.06, 5.9, .09, x + (x < 0 ? .16 : -.16), 3.6, z + .16, led);
        box(.3, .2, 3.65, x, .22, z - 1.8, led);
        box(.12, .65, 3, x * .98, 2.2, z - 1.8, trim);
      }
      box(10.25, .28, .25, 0, 7.2, z); box(9.7, .045, .08, 0, 7, z + .15, led);
      for (const x of [-2.6, 2.6]) box(.1, .05, 1.5, x, 7.4, z - 1.6, led);
      box(10, .04, .08, 0, .045, z, basic('#35414e', .4));
    }
    const floorGeo = new THREE.PlaneGeometry(60, 150); geometries.add(floorGeo);
    const reflector = new Reflector(floorGeo, { color: 0x4a4e55, textureWidth: mobile ? 128 : 256, textureHeight: mobile ? 128 : 256, clipBias: .003, multisample: 0 });
    let reflectedAt = -Infinity;
    const reflectFrame = reflector.onBeforeRender.bind(reflector);
    reflector.onBeforeRender = (...args: Parameters<typeof reflectFrame>) => {
      const now = performance.now();
      if (now - reflectedAt < (mobile ? 60 : 30)) return;
      reflectedAt = now; reflectFrame(...args);
    };
    reflector.rotation.x = -Math.PI / 2; reflector.position.set(0, -.015, -32 - EXTRA / 2); scene.add(reflector);
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: '#0c141e', metalness: .7, roughness: .25, transparent: true, opacity: .77 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, .003, -32 - EXTRA / 2); floor.receiveShadow = true; scene.add(floor);
    const floorStrip = basic('#d9c391', .45);
    for (const x of [-4.2, 4.2]) box(.035, .008, 53 + EXTRA, x, .017, -10 - EXTRA / 2, floorStrip);

    const makeCanvas = (width: number, height: number) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas không khả dụng');
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture); return { canvas, ctx, texture };
    };
    const panel = makeCanvas(1024, 576);
    const panelMat = new THREE.MeshBasicMaterial({ map: panel.texture, toneMapped: false });
    // Màn LED lớn gần liền nhau phủ hai vách; khung vòm vàng nằm phía trước tạo các vạch sáng dọc.
    const panelGeo = new THREE.PlaneGeometry(9.6, 5.4); geometries.add(panelGeo);
    // Cặp màn đầu tiên có canvas riêng: hiện ảnh nền intro của gói đúng một lần, không lặp ở các màn sau.
    // Đặt lùi vào trong (z = INTRO_Z) để sau khi xuyên qua vùng sáng ở cửa hầm còn một đoạn trống, thấy rõ màn hiện ra.
    const INTRO_Z = -13;
    const intro = makeCanvas(1024, 576);
    const introMat = new THREE.MeshBasicMaterial({ map: intro.texture, toneMapped: false });
    for (const z of Array.from({ length: 8 }, (_, i) => INTRO_Z - i * 10)) for (const side of [-1, 1]) {
      const screen = new THREE.Mesh(panelGeo, z === INTRO_Z ? introMat : panelMat); screen.position.set(side * 5.03, 3.75, z); screen.rotation.y = -side * Math.PI / 2; scene.add(screen);
    }
    // Sân khấu và khán đài ở cuối đường hầm; không dựng cửa hoặc thẻ áo trắng.
    const stageGeo = new THREE.CylinderGeometry(8.2, 8.6, .35, mobile ? 32 : 64); geometries.add(stageGeo);
    const stageMat = new THREE.MeshStandardMaterial({ color: '#2b3949', metalness: .4, roughness: .42 });
    const stage = new THREE.Mesh(stageGeo, stageMat); stage.position.set(0, .18, STAGE_Z); stage.receiveShadow = true; scene.add(stage);
    const ringMaterial = basic('#ead29a');
    for (const radius of [7.9, 6.9]) {
      const geo = new THREE.TorusGeometry(radius, .025, 4, mobile ? 48 : 80); geometries.add(geo);
      const ring = new THREE.Mesh(geo, ringMaterial); ring.rotation.x = Math.PI / 2; ring.position.set(0, .39, STAGE_Z); scene.add(ring);
    }
    for (let tier = 0; tier < 4; tier++) {
      const geo = new THREE.CylinderGeometry(28 + tier * 2, 27 + tier * 2, 1.4, 64, 1, true, Math.PI / 2, Math.PI); geometries.add(geo);
      const stand = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: tier % 2 ? '#24303b' : '#141f29', side: THREE.DoubleSide, roughness: .8 })); stand.position.set(0, 1.5 + tier * 1.7, STAGE_Z - 3); scene.add(stand);
    }
    const glow = makeCanvas(128, 128);
    const gradient = glow.ctx.createRadialGradient(64, 64, 0, 64, 64, 64); gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.12, '#fff3ceaa'); gradient.addColorStop(.45, '#dcb97422'); gradient.addColorStop(1, '#dcb97400'); glow.ctx.fillStyle = gradient; glow.ctx.fillRect(0, 0, 128, 128); glow.texture.needsUpdate = true;
    // Vùng sáng trắng đứng yên ở cửa hầm: lấp kín mặt cắt hầm, camera đi xuyên qua rồi khung LED mới sáng.
    const gateGlow = makeCanvas(256, 256);
    const gateGradient = gateGlow.ctx.createRadialGradient(128, 128, 0, 128, 128, 128); gateGradient.addColorStop(0, '#ffffff'); gateGradient.addColorStop(.3, '#f4fbffee'); gateGradient.addColorStop(.6, '#bfe0ff88'); gateGradient.addColorStop(1, '#6aa8ff00'); gateGlow.ctx.fillStyle = gateGradient; gateGlow.ctx.fillRect(0, 0, 256, 256); gateGlow.texture.needsUpdate = true;
    const gateMaterial = new THREE.MeshBasicMaterial({ map: gateGlow.texture, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false });
    const gate = new THREE.Mesh(new THREE.PlaneGeometry(14, 11), gateMaterial); gate.position.set(0, 3.8, gateZ(false)); scene.add(gate);
    const gateCoreMaterial = new THREE.SpriteMaterial({ map: gateGlow.texture, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false }); const gateCore = new THREE.Sprite(gateCoreMaterial); gateCore.scale.set(9, 9, 1); gateCore.position.set(0, 3.8, gateZ(false)); scene.add(gateCore);
    // Đồng bộ với .rt-gate-light ở phòng chờ để qua cửa không bị chớp trắng.
    const GATE_FLASH_PEAK = .45;
    const gateFlash = document.createElement('div'); gateFlash.className = 'gate-flash'; container.appendChild(gateFlash);

    // Thông tin giữa hầm (cờ → vị trí → logo đội) là tấm bảng ghim trong hầm, kèm chùm tia trắng từ hai bên vách chiếu vào
    // mép bảng (bật / tắt theo từng thông tin). Mỗi thông tin đặt bảng cách
    // vị trí camera ở giữa lượt hiện INFO_AHEAD đơn vị (camera tiến tới nên bảng to dần), hiện / tắt cùng nhịp chữ.
    // Bảng không vượt quá INFO_MAX_Z (ngay trước lối ra sáng ở khung cuối): logo đội hiện lúc camera đã gần cuối hầm nên bảng gần hơn;
    // bảng bị giới hạn thì thu nhỏ theo khoảng cách (giữ cỡ nhìn ~1/3 màn hình thay vì phình to), camera tới sát (dưới INFO_NEAR[1])
    // thì mờ dần, tắt hẳn ở INFO_NEAR[0].
    const INFO_W = 8, INFO_H = INFO_W / 1.5, INFO_Y = 3.5, INFO_AHEAD = 22, INFO_PX = [768, 512] as const, INFO_MAX_Z = lastRibZ + .5, INFO_FIT = 16, INFO_NEAR = [3, 5] as const;
    // Ba mặt bảng vẽ và tải lên GPU sẵn từ đầu lượt mở; đổi thông tin chỉ đổi texture, không vẽ / tải lại giữa chừng.
    // Đổi cầu thủ thì xếp hàng: mỗi khung hình vẽ + tải một mặt (dồn cả ba vào một khung gây khựng lúc bắt đầu cảnh).
    const infoFaces = [3, 4, 5].map(() => makeCanvas(INFO_PX[0], INFO_PX[1]));
    let infoQueue: number[] = [];
    const paintFace = (i: number) => { const face = infoFaces[i]; drawWorldInfo(face.ctx, { ...state.current, phase: 3 + i }, INFO_PX[0], INFO_PX[1], () => { if (!infoQueue.includes(i)) infoQueue.push(i); }); face.texture.needsUpdate = true; renderer.initTexture(face.texture); };
    const paintInfo = () => { infoQueue = [0, 1, 2]; };
    const infoMaterial = new THREE.MeshBasicMaterial({ map: infoFaces[0].texture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
    const infoGroup = new THREE.Group(); infoGroup.visible = false; scene.add(infoGroup);
    const infoGeo = new THREE.PlaneGeometry(INFO_W, INFO_H); geometries.add(infoGeo);
    const infoBoard = new THREE.Mesh(infoGeo, infoMaterial); infoBoard.position.y = INFO_Y; infoBoard.renderOrder = 3; infoGroup.add(infoBoard);
    const rayGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true); geometries.add(rayGeo);
    const rayMaterial = (color: string) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    const whiteRay = rayMaterial('#ffffff');
    const rayUp = new THREE.Vector3(0, 1, 0);
    const beam = (from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material, parent: THREE.Object3D = infoGroup) => {
      const dir = to.clone().sub(from), mesh = new THREE.Mesh(rayGeo, material);
      mesh.position.copy(from).addScaledVector(dir, .5); mesh.scale.set(radius, dir.length(), radius); mesh.quaternion.setFromUnitVectors(rayUp, dir.normalize());
      mesh.renderOrder = 2; parent.add(mesh);
    };
    // Tia trắng: mỗi bên một nguồn sáng trên vách (dựng ở trước bảng 9 đơn vị), 9 tia mảnh chụm vào mép bảng. Cả cụm co theo trục z
    // khi bảng gần camera (logo đội ở cuối hầm) để nguồn sáng vẫn nằm trên vách trong khung hình, không chiếu từ ngoài mép màn hình vào.
    const WHITE_REACH = 9, whiteGroup = new THREE.Group(); infoGroup.add(whiteGroup);
    const rayGlowMaterial = new THREE.SpriteMaterial({ map: gateGlow.texture, blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
    for (const side of [-1, 1]) {
      const source = new THREE.Vector3(side * 4.85, 3.3, WHITE_REACH);
      for (let i = 0; i < 9; i++) beam(source, new THREE.Vector3(side * (INFO_W / 2 - .1), INFO_Y - INFO_H / 2 + .4 + i * (INFO_H - .8) / 8, .02), .012, whiteRay, whiteGroup);
      const glow = new THREE.Sprite(rayGlowMaterial); glow.scale.set(1.1, 1.1, 1); glow.position.copy(source); whiteGroup.add(glow);
    }
    const ease = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
    // Hiện / ẩn dần trong INFO_FADE đầu và cuối mỗi lượt, đường cong smootherstep (khởi đầu và kết thúc êm).
    const INFO_FADE = .3, soft = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * c * (c * (c * 6 - 15) + 10); };
    let infoKey = '', infoPhase = -1, infoClamped = false;

    // Dải LED vàng gắn dọc vách / trần / sàn suốt chiều dài hầm (phối cảnh thành các vệt toả về tâm hầm): tối lúc đầu,
    // thông tin đầu tiên (cờ) hiện thì toàn bộ bật sáng và giữ sáng; kèm lớp quầng cộng màu mờ quanh mỗi dải.
    // Chạy từ khung đầu tới khung cuối của hầm (không thò qua khung cuối ra đoạn tối ở miệng hầm).
    const STRIP_ON = new THREE.Color('#ffd23a'), STRIP_FROM = 15, stripLength = STRIP_FROM - lastRibZ, stripZ = (STRIP_FROM + lastRibZ) / 2;
    const stripMaterial = new THREE.MeshBasicMaterial({ color: STRIP_ON.clone().multiplyScalar(.035), toneMapped: false });
    const stripGlow = new THREE.MeshBasicMaterial({ color: '#ffc21a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const strip = (x: number, y: number, w: number, h: number) => { box(w, h, stripLength, x, y, stripZ, stripMaterial); box(w * 3, h * 3, stripLength, x, y, stripZ, stripGlow).renderOrder = 1; };
    for (const side of [-1, 1]) for (const y of [.6, 1.5, 2.6, 4.3, 5.4, 6.4]) strip(side * 4.84, y, .05, .07);
    for (const x of [-3.6, -2.2, -.8, .8, 2.2, 3.6]) { strip(x, 6.98, .07, .05); strip(x * .95, .03, .07, .03); }
    // Bật sáng dần trong STRIP_RISE ms tính từ lúc cờ bắt đầu hiện (cùng nhịp với cờ), đường cong smootherstep.
    const STRIP_RISE = { standard: 900, quick: 450 };
    let stripLevel = 0;

    // Cuối hầm là lối ra sáng trắng (ánh đèn sân vận động): tấm sáng vừa khít lòng khung cuối của hầm (không bị sương làm mờ nên từ xa đã thấy
    // ánh sáng cuối đường) + quầng sáng và đèn chiếu sáng vách đoạn cuối. Hiện sau khi qua cửa hầm; camera lao vào vùng sáng
    // thì màn trắng dần (lớp gate-flash) trong EXIT_WHITE ms trước mốc 6 (mở thẻ), giữ trắng EXIT_HOLD ms (che cú nhảy camera qua đoạn
    // hầm nối và các mốc 6–9 chuyển liên tiếp) rồi tan trong EXIT_CLEAR ms; cả hai chiều theo smootherstep.
    const EXIT_Z = lastRibZ - .15, EXIT_WHITE = { standard: 700, quick: 350 }, EXIT_HOLD = { standard: 120, quick: 70 }, EXIT_CLEAR = { standard: 650, quick: 350 };
    const exitFace = makeCanvas(512, 384);
    {
      const g = exitFace.ctx, w = 512, h = 384, glow = g.createRadialGradient(w / 2, h * .56, 8, w / 2, h * .56, w * .72);
      glow.addColorStop(0, '#ffffff'); glow.addColorStop(.55, '#f2f6fa'); glow.addColorStop(1, '#c9d3de'); g.fillStyle = glow; g.fillRect(0, 0, w, h);
      // Mép mái sân và dàn đèn mờ phía trên.
      g.fillStyle = '#dbe3ec'; g.fillRect(0, h * .17, w, h * .018);
      g.fillStyle = '#ffffff'; for (let i = 0; i < 7; i++) g.fillRect(w * (.12 + i * .127) - 13, h * .085, 26, 6);
      exitFace.texture.needsUpdate = true;
    }
    // depthWrite: che hẳn sân khấu / bục phía sau miệng hầm (kể cả vật trong suốt vẽ sau).
    const exitMaterial = new THREE.MeshBasicMaterial({ map: exitFace.texture, transparent: true, opacity: 0, depthWrite: true, toneMapped: false, fog: false });
    const exitGeo = new THREE.PlaneGeometry(9.9, 7.1); geometries.add(exitGeo);
    const exitPlane = new THREE.Mesh(exitGeo, exitMaterial); exitPlane.position.set(0, 3.55, EXIT_Z); scene.add(exitPlane);
    const exitHaloMaterial = new THREE.SpriteMaterial({ map: gateGlow.texture, blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
    const exitHalo = new THREE.Sprite(exitHaloMaterial); exitHalo.scale.set(18, 14, 1); exitHalo.position.set(0, 3.55, EXIT_Z + .5); scene.add(exitHalo);
    const exitLight = new THREE.PointLight('#f4f8ff', 0, 26, 1.2); exitLight.position.set(0, 4.2, EXIT_Z + 3); scene.add(exitLight);
    let exitLevel = 0;
    const lampMaterial = new THREE.SpriteMaterial({ map: glow.texture, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    for (let i = 0; i < 16; i++) {
      const angle = i / 16 * Math.PI * 2;
      const lamp = new THREE.Sprite(lampMaterial); lamp.position.set(Math.sin(angle) * 28, 10, STAGE_Z - 3 + Math.cos(angle) * 28); lamp.scale.set(4.5, 4.5, 1); scene.add(lamp);
      box(3.2, .13, .2, lamp.position.x, 9.8, lamp.position.z, basic('#d6e8f2'));
    }

    let seed = 1357;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const crowdCount = mobile ? 320 : 1100;
    const crowdPositions = new Float32Array(crowdCount * 3);
    for (let i = 0; i < crowdCount; i++) {
      const angle = Math.PI / 2 + rnd() * Math.PI, tier = Math.floor(rnd() * 5), radius = 28 + tier * 1.5;
      crowdPositions[i * 3] = Math.sin(angle) * radius; crowdPositions[i * 3 + 1] = 1.4 + tier * 1.7 + rnd() * .5; crowdPositions[i * 3 + 2] = STAGE_Z - 3 + Math.cos(angle) * radius;
    }
    const crowdGeo = new THREE.BufferGeometry(); crowdGeo.setAttribute('position', new THREE.BufferAttribute(crowdPositions, 3)); geometries.add(crowdGeo);
    const crowd = new THREE.Points(crowdGeo, new THREE.PointsMaterial({ color: '#b8cbd7', size: .09, transparent: true, opacity: .65, depthWrite: false })); scene.add(crowd);
    const dustCount = mobile ? 65 : 200, dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) { dustPositions[i * 3] = (rnd() - .5) * 16; dustPositions[i * 3 + 1] = rnd() * 9; dustPositions[i * 3 + 2] = 15 - rnd() * (90 + EXTRA); }
    const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3)); geometries.add(dustGeo);
    const dustMaterial = new THREE.PointsMaterial({ color: '#f5dfad', size: mobile ? .045 : .035, transparent: true, opacity: .45, depthWrite: false });
    const dust = new THREE.Points(dustGeo, dustMaterial); scene.add(dust);
    const smoke: THREE.Sprite[] = [];
    for (let i = 0; i < (mobile ? 4 : 9); i++) { const mat = new THREE.SpriteMaterial({ map: glow.texture, color: '#718fa5', transparent: true, opacity: .045, depthWrite: false, blending: THREE.AdditiveBlending }); const sprite = new THREE.Sprite(mat); sprite.position.set(i % 2 ? 3.8 : -3.8, .6, 10 - i * 7); sprite.scale.set(9, 3, 1); smoke.push(sprite); scene.add(sprite); }
    const sparksCount = mobile ? 80 : 260;
    const sparkGeo = new THREE.BufferGeometry(), sparkPositions = new Float32Array(sparksCount * 3);
    const velocities = Array.from({ length: sparksCount }, (_, i) => ({ side: i % 2 ? -1 : 1, x: (rnd() - .5) * 2.5, y: 4 + rnd() * 5.3, z: (rnd() - .5) * 2, delay: rnd() * 1.3 }));
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3)); geometries.add(sparkGeo);
    const sparkMaterial = new THREE.PointsMaterial({ map: glow.texture, color: '#ffe8a5', size: .18, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sparks = new THREE.Points(sparkGeo, sparkMaterial); sparks.frustumCulled = false; scene.add(sparks);

    // Gộp các khung/vách dùng chung vật liệu, giảm lệnh vẽ ở cả cảnh và phản chiếu.
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    scene.children.forEach(object => {
      if (object instanceof THREE.Mesh && object.geometry === boxGeometry && !Array.isArray(object.material)) {
        const list = batches.get(object.material) || []; list.push(object); batches.set(object.material, list);
      }
    });
    batches.forEach((meshes, material) => {
      if (meshes.length < 2) return;
      const batch = new THREE.InstancedMesh(boxGeometry, material, meshes.length);
      meshes.forEach((mesh, i) => { mesh.updateMatrix(); batch.setMatrixAt(i, mesh.matrix); scene.remove(mesh); });
      batch.instanceMatrix.needsUpdate = true; batch.computeBoundingSphere(); scene.add(batch);
    });
    const lookTarget = new THREE.Vector3(0, 3.3, cameraPose(0).lookZ);
    const flamePoint = new THREE.Vector3(), flameFov = Math.tan(THREE.MathUtils.degToRad(27)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let frame = 0, previous = performance.now(), phaseSince = previous, lastPhase = -1, progress = 0, alive = true, average = 16, slowFrames = 0;
    let startedAt: number | null = null, prepared = false, wasPlaying = false, qualityChangedAt = -Infinity, ledSmooth = .03, skipped = false;
    const view = { w: 1, h: 1 };
    const resize = () => {
      const width = container.clientWidth || innerWidth, height = container.clientHeight || innerHeight;
      view.w = width; view.h = height;
      const compact = width <= 700 || (matchMedia('(pointer: coarse)').matches && width <= 900);
      if (compact !== mobile) {
        mobile = compact; renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
        const resolution = mobile ? 128 : 256; reflector.getRenderTarget().setSize(resolution, resolution);
        crowdGeo.setDrawRange(0, Math.min(crowdCount, mobile ? 320 : 1100));
        dustGeo.setDrawRange(0, Math.min(dustCount, mobile ? 65 : 200));
        sparkGeo.setDrawRange(0, Math.min(sparksCount, mobile ? 80 : 260));
        camera.fov = mobile ? 62 : 54;
      }
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
    };
    resize(); const observer = new ResizeObserver(resize); observer.observe(container);
    const onLost = (event: Event) => { event.preventDefault(); state.current.onFallback(); }; renderer.domElement.addEventListener('webglcontextlost', onLost);
    let appliedAccent: string | undefined = '', stageMix = 0;
    // Màu gốc theo accent; khi thẻ xuất hiện trộn dần sang màu bục / LED riêng của mùa thẻ (pack.stage).
    const baseLight = new THREE.Color(), baseRing = new THREE.Color(), baseStage = new THREE.Color('#2b3949'), revealColor = new THREE.Color(), white = new THREE.Color('#ffffff');
    const GOLD = { light: '#f1dba3', trim: '#a89a77', strip: '#d9c391', ring: '#ead29a', stage: '#ffe5ae', spot: '#fff2d2', dust: '#f5dfad', spark: '#ffe8a5' };
    const applyAccent = (accent?: string) => {
      appliedAccent = accent;
      const tone = (gold: string, mixWhite: number, dim = 1) => accent ? new THREE.Color(accent).lerp(new THREE.Color('#ffffff'), mixWhite).multiplyScalar(dim) : new THREE.Color(gold);
      baseLight.copy(tone(GOLD.light, .35)); trim.color.copy(tone(GOLD.trim, .1, .75)); floorStrip.color.copy(tone(GOLD.strip, .3));
      baseRing.copy(tone(GOLD.ring, .3)); stageLight.color.copy(tone(GOLD.stage, .5)); spotlight.color.copy(tone(GOLD.spot, .6));
      dustMaterial.color.copy(tone(GOLD.dust, .45)); sparkMaterial.color.copy(tone(GOLD.spark, .4));
    };
    let paintedBack: string | undefined;
    // Nội dung màn LED chỉ đổi ở mốc 3–5 (quốc tịch, vị trí, đội bóng); các mốc khác giống nhau nên không vẽ lại
    // (vẽ + tải 2 canvas 1024×576 lên GPU đúng lúc qua cửa hầm làm khựng nhịp tan sương).
    const ledContent = (phase: number) => phase >= 3 && phase <= 5 ? phase : 0;
    const paintLed = (phase: number) => {
      const info = { ...state.current, phase }, redraw = () => { if (ledContent(lastPhase) === ledContent(phase)) paintLed(phase); };
      drawBadge(intro.ctx, info.intro ? { ...info, back: info.intro } : info, 1024, 576, redraw);
      drawBadge(panel.ctx, info.intro ? { ...info, off: true } : info, 1024, 576, redraw);
      panel.texture.needsUpdate = true; intro.texture.needsUpdate = true;
    };
    let sleeping = false;
    const sleep = () => { cancelAnimationFrame(frame); sleeping = true; };
    wake.current = () => { if (!alive || !sleeping) return; sleeping = false; previous = performance.now(); frame = requestAnimationFrame(animate); };
    const animate = (now: number) => {
      if (!alive) return;
      frame = requestAnimationFrame(animate);
      const interval = now - previous;
      const dt = Math.min(interval / 1000, .1); previous = now;
      if (document.hidden) return;
      const playing = state.current.playing !== false;
      if (playing !== wasPlaying) {
        if (!playing) {
          prepared = false; startedAt = null; progress = 0; lastPhase = -1; ledSmooth = .03; skipped = false; stageMix = 0; fog.density = DARK_FOG;
          lookTarget.set(0, 3.3, cameraPose(0).lookZ);
          stageLight.intensity = 35; spotlight.intensity = 120; ambient.intensity = .025; renderer.toneMappingExposure = .12;
          ribs.forEach(rib => { rib.brightness = .015; });
        }
        wasPlaying = playing;
      }
      if (!playing && prepared) { sleep(); return; }
      const phase = playing ? state.current.phase : 0;
      if (state.current.accent !== appliedAccent) applyAccent(state.current.accent);
      const backKey = `${state.current.back}|${state.current.intro}`;
      if (phase !== lastPhase || backKey !== paintedBack) {
        const repaint = ledContent(phase) !== ledContent(lastPhase) || backKey !== paintedBack;
        lastPhase = phase; phaseSince = now; paintedBack = backKey;
        if (repaint) paintLed(phase);
      }
      const age = (now - phaseSince) / 1000;
      // Màn kết quả đã hiện hẳn (phông sân vận động của màn hiện thẻ che kín cảnh 3D): ngừng vẽ cho đỡ tốn GPU / CPU;
      // lượt mở mới (mốc < 9) vẽ lại bình thường.
      if (phase >= 9 && age > 1.2) { sleep(); return; }
      // Màn LED sáng/tắt cùng lúc với chữ giữa màn hình; giữ chút ánh nền để màn không tắt hẳn.
      // Trước khi camera xuyên qua vùng sáng ở cửa hầm (mốc 1), các màn LED còn tối.
      ledSmooth = THREE.MathUtils.damp(ledSmooth, phase < 1 ? .03 : .07 + .93 * infoVisibility(phase, state.current.back), 6, dt); const ledLevel = ledSmooth; panelMat.color.setScalar(ledLevel); introMat.color.setScalar(ledLevel); container.dataset.ledLevel = ledLevel.toFixed(2);
      const elapsed = state.current.getElapsed?.() ?? (startedAt === null ? 0 : now - startedAt);
      const duration = OPENING_CUES[state.current.quick ? 'quick' : 'standard'][8];
      // Bỏ qua (tới thẻ trước giờ): lướt tới sân khấu rồi giữ đó, không quay về đường cong gốc kẻo camera lùi lại và chạy lần hai.
      if (phase >= 9 && elapsed < duration - 150) skipped = true;
      progress = skipped ? THREE.MathUtils.damp(progress, 1, 9, dt) : cameraProgress(elapsed, state.current.quick);
      const pose = cameraPose(progress);
      camera.position.set(pose.x, pose.y, pose.z);
      lookTarget.z = pose.lookZ;
      camera.lookAt(lookTarget); cameraLight.position.copy(camera.position); cameraLight.position.y += 1;
      // Càng gần vùng sáng càng lóa trắng; qua khỏi thì tắt nhanh hơn để lộ hầm.
      const gz = gateZ(state.current.quick), ahead = camera.position.z - gz;
      // Chỉ hiện sau khi thẻ nhiễu đã tan (hết CAMERA_HOLD), sáng dần trong 0,3 s.
      const gateIn = playing ? Math.min(1, Math.max(0, (elapsed - CAMERA_HOLD[state.current.quick ? 'quick' : 'standard']) / 300)) : 0;
      // Hai lớp sáng cộng màu cần giảm riêng để tâm cửa không bị cháy trắng.
      gateMaterial.opacity = gateIn * .65;
      gateCoreMaterial.opacity = gateIn * .3;
      gate.position.z = gz; gateCore.position.z = gz; gate.visible = gateCore.visible = gateIn > 0 && ahead > -.2 && phase < 3;
      // Qua vùng sáng: ánh trắng tan dần trong lúc sương cũng tan, để trắng hòa thẳng vào đường hầm, không chớp tối giữa chừng.
      const quickMode = state.current.quick, crossed = playing ? elapsed - GATE_CROSS[quickMode ? 'quick' : 'standard'] : -1;
      const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
      const flash = crossed < 0 ? Math.max(0, 1 - ahead / 6) ** 2 : 1 - smooth(crossed / (quickMode ? 170 : 250));
      // Sương tan theo log mật độ (mắt cảm nhận độ mỏng của sương theo tỉ lệ, không theo hiệu số) trong ~0,4 s theo smoothstep (khởi đầu và kết thúc êm, không bật một phát):
      // ánh trắng tắt dần trong ~0,25 s chồng lên lúc sương mỏng đi nên trắng chuyển thẳng sang hầm, không chợt tối giữa chừng.
      fog.density = crossed < 0 ? DARK_FOG : DARK_FOG * (CLEAR_FOG / DARK_FOG) ** smooth(crossed / (quickMode ? 260 : 400));
      // Lối ra sáng cuối hầm: sáng lên sau khi qua cửa hầm; camera tới gần thì màn trắng dần, qua khỏi (mốc 6, mở thẻ) thì tắt.
      exitLevel = playing && phase >= 1 && phase < 6 ? Math.max(exitLevel, smooth(crossed / 500)) : playing ? THREE.MathUtils.damp(exitLevel, 0, 12, dt) : 0;
      exitMaterial.opacity = exitLevel; exitHaloMaterial.opacity = exitLevel * .5; exitLight.intensity = exitLevel * 45;
      const speedKey = state.current.quick ? 'quick' : 'standard', toExit = OPENING_CUES[speedKey][5] - elapsed;
      const exitFlash = !playing || skipped || phase < 1 ? 0 : toExit > 0 ? soft(1 - toExit / EXIT_WHITE[speedKey]) : soft(1 - (-toExit - EXIT_HOLD[speedKey]) / EXIT_CLEAR[speedKey]);
      gateFlash.style.opacity = playing && (phase < 9 || exitFlash > 0) ? Math.max(phase < 9 ? flash * GATE_FLASH_PEAK : 0, exitFlash).toFixed(3) : '0';
      stageLight.intensity = THREE.MathUtils.damp(stageLight.intensity, phase >= 8 ? 130 : 35, 4, dt);
      spotlight.intensity = THREE.MathUtils.damp(spotlight.intensity, phase >= 8 ? 350 : 120, 4, dt);
      ambient.intensity = THREE.MathUtils.damp(ambient.intensity, phase === 0 ? .025 : phase === 6 ? .035 : phase >= 8 ? .9 : .6, 5, dt);
      const exposure = phase === 0 ? .12 + Math.min(age, .7) * .22 : phase === 6 ? .42 : phase >= 8 ? 1.2 : .9;
      renderer.toneMappingExposure = THREE.MathUtils.damp(renderer.toneMappingExposure, exposure, 5, dt);
      const look = state.current.stage;
      stageMix = THREE.MathUtils.damp(stageMix, look && phase >= 9 ? 1 : 0, 3, dt);
      lightColor.copy(baseLight); ringMaterial.color.copy(baseRing); stageMat.color.copy(baseStage); stageMat.emissive.setScalar(0);
      if (look && stageMix > .001) {
        if (look.led) lightColor.lerp(revealColor.set(look.led).lerp(white, .2), stageMix);
        ringMaterial.color.lerp(revealColor.set(look.ring), stageMix);
        stageMat.color.lerp(revealColor.set(look.top), stageMix); stageMat.emissive.copy(revealColor).multiplyScalar(.35 * stageMix);
      }
      ribs.forEach((rib, i) => {
        const lit = phase >= 2 || (phase === 1 && i <= age * 12);
        rib.brightness = THREE.MathUtils.damp(rib.brightness, lit ? .8 + .18 * Math.sin(now * .002 - i * .45) : .01, 7, dt);
        rib.material.color.copy(lightColor).multiplyScalar(rib.brightness);
      });
      dust.position.z = Math.sin(now * .0001) * 2; dust.rotation.y = Math.sin(now * .00009) * .015;
      smoke.forEach((sprite, i) => { sprite.position.x = (i % 2 ? 3.8 : -3.8) + Math.sin(now * .0005 + i) * .4; });
      sparks.visible = phase >= 9 && age < 4;
      if (sparks.visible) {
        velocities.forEach((v, i) => { const t = Math.max(0, age - v.delay); sparkPositions[i * 3] = v.side * 5.4 + v.x * t; sparkPositions[i * 3 + 1] = age < v.delay ? -5 : Math.max(-1, .5 + v.y * t - 3.2 * t * t); sparkPositions[i * 3 + 2] = STAGE_Z + 2 + v.z * t; });
        sparkGeo.attributes.position.needsUpdate = true; sparkMaterial.opacity = Math.max(0, 1 - age / 4);
      }
      // Tấm bảng thông tin + tia sáng 3D theo mốc 3–5.
      const facesKey = `${state.current.flag}|${state.current.nation}|${state.current.position}|${state.current.team}|${state.current.teamLogo}`;
      if (facesKey !== infoKey) { infoKey = facesKey; paintInfo(); }
      const nextFace = infoQueue.shift(); if (nextFace !== undefined) paintFace(nextFace);
      const infoCues = OPENING_CUES[state.current.quick ? 'quick' : 'standard'], infoGap = INFO_GAP[state.current.quick ? 'quick' : 'standard'];
      let infoFade = 0;
      if (playing && !skipped && phase >= 3 && phase <= 5) {
        const start = infoCues[phase - 1], span = infoCues[phase] - start - infoGap;
        if (infoPhase !== phase) {
          infoPhase = phase;
          const midZ = cameraPose(cameraProgress(start + span / 2, state.current.quick)).z;
          infoClamped = midZ - INFO_AHEAD < INFO_MAX_Z; infoGroup.position.z = Math.max(INFO_MAX_Z, midZ - INFO_AHEAD); infoMaterial.map = infoFaces[phase - 3].texture;
          whiteGroup.scale.z = Math.min(1, Math.max(.33, (midZ - infoGroup.position.z) * .4 / WHITE_REACH));
        }
        const t = (elapsed - start) / span;
        infoFade = t <= 0 || t >= 1 ? 0 : soft(Math.min(t / INFO_FADE, (1 - t) / INFO_FADE, 1)) * (infoClamped ? ease((camera.position.z - infoGroup.position.z - INFO_NEAR[0]) / (INFO_NEAR[1] - INFO_NEAR[0])) : 1);
        const infoDistance = camera.position.z - infoGroup.position.z, fit = infoClamped ? Math.min(1, Math.max(.4, infoDistance / INFO_FIT)) : 1;
        // Hiện: nở nhẹ từ 90% lên đúng cỡ; ẩn: lớn thêm chút trong lúc mờ đi (cảm giác trôi qua).
        infoBoard.scale.setScalar((.9 + .1 * soft(t / INFO_FADE)) * (1 + .04 * soft((t - (1 - INFO_FADE)) / INFO_FADE)) * fit);
      } else infoPhase = -1;
      infoGroup.visible = infoFade > 0;
      // Dải LED vàng: sáng dần từ lúc hiện cờ (mốc 3) và giữ sáng; bỏ qua thì sáng ngay; lượt mở mới (chưa phát) thì tắt.
      stripLevel = !playing || phase < 3 ? 0 : skipped ? 1 : soft((elapsed - infoCues[2]) / STRIP_RISE[state.current.quick ? 'quick' : 'standard']);
      stripMaterial.color.copy(STRIP_ON).multiplyScalar(.035 + .965 * stripLevel); stripGlow.opacity = stripLevel * .22;
      infoMaterial.opacity = infoFade; whiteRay.opacity = infoFade * .55; rayGlowMaterial.opacity = infoFade * .45;
      try { renderer.render(scene, camera); } catch { alive = false; state.current.onFallback(); return; }
      // Máy phun lửa ghim trên sàn hầm: chiếu vị trí ra màn hình, tỉ lệ theo khoảng cách; đi qua camera thì ẩn.
      const flameRoot = state.current.flames?.current;
      if (flameRoot) {
        const w = view.w, h = view.h, distance = camera.position.z - FLAME_Z;
        const at = (side: number): FlamePlacement => {
          if (distance < 1.2) return null;
          flamePoint.set(side * FLAME_X, FLAME_Y, FLAME_Z).project(camera);
          return { x: (flamePoint.x + 1) / 2 * w, y: (1 - flamePoint.y) / 2 * h, k: FLAME_REF_DISTANCE / distance * flameFov };
        };
        placeFlames(flameRoot, at(-1), at(1));
      }
      if (!prepared) { prepared = true; container.dataset.prepared = 'true'; state.current.onPrepared?.(); }
      if (playing && startedAt === null) { startedAt = performance.now(); state.current.onReady(); }
      container.dataset.drawCalls = String(renderer.info.render.calls);
      const cost = performance.now() - now;
      average = average * .94 + Math.min(100, Math.max(cost, interval)) * .06;
      // Theo nhịp khung hình thực tế; giữ chữ/thẻ DOM sắc nét khi giảm độ phân giải nền.
      if (playing && elapsed > 1000 && phase < 9 && average > 26 && now - qualityChangedAt > 2000 && renderer.getPixelRatio() > (mobile ? .75 : .8)) {
        renderer.setPixelRatio(Math.max(mobile ? .75 : .8, renderer.getPixelRatio() - .15)); qualityChangedAt = now;
      }
      if (now - phaseSince > 800 && phase > 1 && average > 55) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 20) { alive = false; state.current.onFallback(); }
      container.dataset.renderScale = renderer.getPixelRatio().toFixed(2); container.dataset.frameMs = average.toFixed(1);
      container.dataset.cameraZ = camera.position.z.toFixed(2); container.dataset.reflection = mobile ? '128' : '256';
    };
    camera.position.set(0, 3.1, 13); camera.lookAt(lookTarget); renderer.toneMappingExposure = .12;
    // Tia lửa sân khấu bật (để biên dịch shader cùng cảnh); vòng animate ẩn lại ngay khung đầu tới lúc hiện thẻ.
    paintLed(0); sparks.visible = true;
    // Bảng thông tin + tia sáng đang ẩn vẫn phải được biên dịch shader cùng cảnh (compileAsync bỏ qua vật thể ẩn) và vẽ mặt bảng sẵn,
    // kẻo lần đầu hiện (mốc 3) mới biên dịch / tải texture gây khựng; vòng animate sẽ ẩn lại ngay khung đầu.
    infoKey = `${state.current.flag}|${state.current.nation}|${state.current.position}|${state.current.team}|${state.current.teamLogo}`; [0, 1, 2].forEach(paintFace); infoGroup.visible = true;
    // Biên dịch shader trước khi chạy đồng hồ; vẫn cho phép Bỏ qua khi chờ. Lượt vẽ phản chiếu sàn vẽ vào render target (không tone mapping)
    // nên cần biến thể shader riêng: biên dịch cả biến thể đó, kẻo vật lần đầu lọt vào phản chiếu (bảng thông tin, tia lửa) gây khựng.
    const compileMain = renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(reflector.getRenderTarget()); const compileReflection = renderer.compileAsync(scene, camera); renderer.setRenderTarget(null);
    void Promise.all([compileMain, compileReflection]).catch(() => {}).then(() => {
      if (!alive) return;
      // Vẽ thử một khung (bị màn chờ che) khi mọi vật còn đang bật, cả lượt phản chiếu sàn: lần dùng đầu của từng shader
      // (tra uniform / attribute, phải chờ GPU) xong từ giờ thay vì giữa lúc hiện cờ / hiện thẻ.
      try { renderer.render(scene, camera); } catch { /* Lỗi ngữ cảnh WebGL do vòng animate xử lý (onFallback). */ }
      previous = performance.now(); frame = requestAnimationFrame(animate);
    });
    return () => {
      alive = false; wake.current = () => {}; cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener('webglcontextlost', onLost);
      const materials = new Set<THREE.Material>();
      scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite) { if ('geometry' in object) geometries.add(object.geometry); const material = object.material; (Array.isArray(material) ? material : [material]).forEach(m => materials.add(m)); } });
      gateFlash.remove(); reflector.dispose(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); renderer.dispose(); renderer.domElement.remove();
    };
    };
    return () => { clearTimeout(launch); dispose?.(); };
  }, []);
  // data-world-info: thông tin giữa hầm vẽ trong cảnh 3D nên ẩn lớp chữ / tia sáng phủ màn hình (xem info-rays.css).
  return <div className="three-stadium" ref={host} data-renderer="three" data-world-info="true"/>;
}
