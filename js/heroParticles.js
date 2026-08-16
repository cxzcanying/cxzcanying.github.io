/*!
 * heroParticles.js
 * 仿 DeepSeek Harness 首页鲸鱼粒子效果：
 * 粒子拼出指定文字，带聚散 / 闪烁 / 游动动画；
 * 鼠标靠近时粒子被推开，光源跟随指针产生明暗变化。
 * 纯原生 JS + Canvas 2D，无第三方依赖。
 */
(function () {
    'use strict';

    var DEFAULTS = {
        enable: true,
        text: 'cxzcanying',
        fontFamily: 'Monda, "Microsoft YaHei", sans-serif',
        fontWeight: 700,
        density: 3,
        size: 1.15,
        color: '#A9C7FF',
        glowColor: '#5A8DD9',
        shadeMin: 0.38,
        shadeMax: 1.3,
        lightX: 0.82,
        lightY: 0.40,
        lightRange: 1.35,
        lightFollowX: 0.9,
        mouseRadius: 0.42,
        mouseStrength: 1.0,
        mouseDistort: 3.0,
        assemblyDuration: 2.6,
        maxParticles: 3200,
        sampleSize: 512
    };

    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function smoothstep(a, b, x) {
        var t = clamp((x - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
    }
    function hash1(i) { var s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); }
    function hash2(i, j) { var s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return s - Math.floor(s); }

    function extend(target, source) {
        for (var k in source) {
            if (Object.prototype.hasOwnProperty.call(source, k) && source[k] !== undefined) {
                target[k] = source[k];
            }
        }
        return target;
    }

    /* 把文字渲染到离屏画布并采样成粒子数据 */
    function sampleText(cfg) {
        var size = cfg.sampleSize;
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, size, size);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 自动适配字号：文本宽度约占画布 84%
        var fs = 220;
        var measure = function (px) {
            ctx.font = cfg.fontWeight + ' ' + px + 'px ' + cfg.fontFamily;
            return ctx.measureText(cfg.text).width;
        };
        while (fs > 24 && measure(fs) > size * 0.84) { fs *= 0.9; }
        ctx.font = cfg.fontWeight + ' ' + fs + 'px ' + cfg.fontFamily;
        ctx.fillStyle = '#fff';
        ctx.fillText(cfg.text, size / 2, size / 2);

        var img = ctx.getImageData(0, 0, size, size);
        var data = img.data;
        var lum = new Float32Array(size * size);
        for (var i = 0; i < size * size; i++) {
            lum[i] = (0.299 * data[4 * i] + 0.587 * data[4 * i + 1] + 0.114 * data[4 * i + 2]) / 255;
        }

        var half = size / 2;
        var unit = half * 0.78; // 文本宽度映射到约 ±1.1 的舞台单位
        var step = Math.max(2, Math.round(cfg.density));

        var sample = function (s) {
            var out = [];
            for (var y = 0; y <= size - s; y += s) {
                for (var x = 0; x <= size - s; x += s) {
                    // 2x2 平均亮度作为粒子透明度
                    var a = (lum[y * size + x] + lum[y * size + x + 1] +
                             lum[(y + 1) * size + x] + lum[(y + 1) * size + x + 1]) * 0.25;
                    if (a < 0.2) continue;

                    // 3x3 范围内有亮邻居才算有效粒子，同时统计暗邻居比例（边缘粒子）
                    var hasBright = false;
                    var dark = 0;
                    for (var dy = -1; dy <= 1; dy++) {
                        for (var dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            var nx = x + dx * s, ny = y + dy * s;
                            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                            if (lum[ny * size + nx] > 0.25) hasBright = true;
                            else dark++;
                        }
                    }
                    if (!hasBright) continue;

                    var ang = Math.random() * Math.PI * 2;
                    var rad = 0.55 + 0.95 * Math.random();
                    out.push({
                        tx: (x + s * 0.5 - half) / unit,
                        ty: (half - (y + s * 0.5)) / unit,
                        sx: Math.cos(ang) * rad,
                        sy: Math.sin(ang) * rad * 0.72,
                        bx: a,
                        edge: dark / 8,
                        idx: out.length,
                        phase: Math.random() * Math.PI * 2,
                        x: 0, y: 0, vx: 0, vy: 0
                    });
                }
            }
            return out;
        };

        var particles = sample(step);
        while (particles.length > cfg.maxParticles && step < size / 2) {
            step += 2;
            particles = sample(step);
        }
        return particles;
    }

    function createStage(canvas, opts) {
        var cfg = extend(extend({}, DEFAULTS), opts || {});
        var stage = canvas.parentElement;
        var ctx = canvas.getContext('2d');
        if (!ctx) return null;

        var particles = sampleText(cfg);
        if (!particles.length) return null;

        var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        var W = 0, H = 0, viewScale = 1;
        var mouse = { x: 0, y: 0, sx: 0, sy: 0, active: false };
        var strength = 0;
        var startAt = 0;
        var scroll = 0;
        var running = false;
        var rafId = 0;
        var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        function resize() {
            W = stage.clientWidth || 300;
            H = stage.clientHeight || W;
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            viewScale = Math.min(W / 2.6, H / 1.15);
        }

        /* 每个粒子预计算 16 档受光明暗颜色，避免每帧拼接字符串 */
        var hex = cfg.color.replace('#', '');
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        var num = parseInt(hex, 16);
        var baseColor = { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };

        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            p.shades = new Array(16);
            for (var lv = 0; lv < 16; lv++) {
                var vl = lerp(cfg.shadeMin, cfg.shadeMax, lv / 15);
                var warm = clamp(vl - 1, 0, 1);
                var r = Math.round(clamp(baseColor.r * vl * (1 + 0.07 * warm), 0, 255));
                var g = Math.round(clamp(baseColor.g * vl * (1 + 0.02 * warm), 0, 255));
                var b = Math.round(clamp(baseColor.b * vl * (1 - 0.06 * warm), 0, 255));
                p.shades[lv] = 'rgb(' + r + ',' + g + ',' + b + ')';
            }
        }

        function onResize() { resize(); }
        function onMouseMove(e) {
            var rect = stage.getBoundingClientRect();
            mouse.x = (e.clientX - rect.left - W / 2) / viewScale;
            mouse.y = -(e.clientY - rect.top - H / 2) / viewScale;
            mouse.active = true;
        }
        function onMouseLeave() { mouse.active = false; }
        function onScroll() { scroll = Math.min(1, window.scrollY / Math.max(1, window.innerHeight)); }
        function onVisibility() { if (document.hidden) stop(); else start(); }

        function start() {
            if (running || !particles.length) return;
            running = true;
            if (!startAt) startAt = performance.now();
            rafId = requestAnimationFrame(frame);
        }
        function stop() {
            running = false;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
        }

        function frame(now) {
            if (!running) return;
            rafId = requestAnimationFrame(frame);

            var elapsed = (now - startAt) / 1000;
            var t = elapsed * 0.5; // 慢速时间
            var dt = Math.min(0.05, 1 / 30);

            // 聚散进度：延迟 0.3s 开始，三次缓动
            var L = reduced ? 1 : clamp((elapsed - 0.3) / cfg.assemblyDuration, 0, 1);
            var D = 1 - Math.pow(1 - L, 3);
            var assembly = reduced ? 1 : smoothstep(0, 1, D);

            // 鼠标平滑跟随
            mouse.sx += (mouse.x - mouse.sx) * 0.12;
            mouse.sy += (mouse.y - mouse.sy) * 0.12;

            // 鼠标力度淡入淡出
            var target = mouse.active ? cfg.mouseStrength : 0;
            strength += (target - strength) * (1 - Math.pow(0.05, dt));

            // 整体姿态：只在聚拢阶段有一小段旋转，成形后仅保留轻微正弦摆动，避免文字越转越歪
            var rotZ = (1 - D) * 0.3 + 0.03 * Math.sin(0.25 * t);
            var groupY = 0.15 * Math.sin(0.4 * t) + 0.8 * scroll;
            var groupScale = (0.75 + 0.25 * D) * (1 - 0.5 * scroll);

            var cosR = Math.cos(rotZ), sinR = Math.sin(rotZ);
            var n = particles.length;

            // 把鼠标坐标转换到粒子局部坐标系（与绘制同步：减去 groupY、逆旋转、除以 groupScale），
            // 保证"指针指向哪里，粒子就在哪里散开/变亮"
            var mx = mouse.sx, my = mouse.sy - groupY;
            var mouseLocalX = (mx * cosR + my * sinR) / groupScale;
            var mouseLocalY = (-mx * sinR + my * cosR) / groupScale;

            // 光源跟随鼠标（限制偏移量，鼠标离开舞台时光源仍锚定在文字附近）
            var lx = cfg.lightX + clamp(mouseLocalX * cfg.lightFollowX, -0.7, 0.7);
            var ly = cfg.lightY + clamp(mouseLocalY * 0.3, -0.3, 0.3);

            ctx.clearRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'lighter';

            for (var i = 0; i < n; i++) {
                var p = particles[i];
                var idx = p.idx;

                // 聚散：从散落位置插值到目标位置
                var cx = lerp(p.sx, p.tx, assembly);
                var cy = lerp(p.sy, p.ty, assembly);

                // 空闲抖动（边缘更强）+ 波动游动
                var jx = (hash1(idx) - 0.5) * 0.02;
                var jy = (hash2(idx, 1) - 0.5) * 0.02;
                var dx = jx + Math.sin(t * 0.5 + idx * 0.53) * 0.022;
                var dy = jy + Math.cos(t * 0.42 + idx * 0.71) * 0.022;
                var tail = smoothstep(0.4, 1.1, p.tx); // 靠右的粒子摆动更明显
                dy += Math.sin(t * 1.1 - p.tx * 0.8) * 0.028 * tail;
                cx += dx;
                cy += dy;

                // 未成形时的漂浮
                if (assembly < 0.9) {
                    var sc = smoothstep(0.9, 0, assembly);
                    cx += Math.sin(t * 0.5 + idx * 0.1) * 0.05 * sc;
                    cy += Math.cos(t * 0.4 + idx * 0.07) * 0.05 * sc;
                }

                // 鼠标排斥：径向推开 + 每粒子噪声偏转
                if (strength > 0.01 && assembly > 0.8) {
                    var mdx = cx - mouseLocalX, mdy = cy - mouseLocalY;
                    var md = Math.sqrt(mdx * mdx + mdy * mdy);
                    if (md < cfg.mouseRadius && md > 0.001) {
                        var f = 1 - md / cfg.mouseRadius;
                        var force = f * f * f * strength * 0.5;
                        var na = Math.sin(idx * 0.37 + t * 0.5) * cfg.mouseDistort;
                        var ca = Math.cos(na), sa = Math.sin(na);
                        var px2 = mdx / md, py2 = mdy / md;
                        p.vx += (px2 * ca - py2 * sa) * force;
                        p.vy += (px2 * sa + py2 * ca) * force;
                    }
                }

                // 回弹：向目标位置收敛
                p.vx += (p.tx - cx) * 0.05;
                p.vy += (p.ty - cy) * 0.05;
                p.vx *= 0.84;
                p.vy *= 0.84;
                p.x = cx + p.vx;
                p.y = cy + p.vy;

                // 明暗：受光面随光源位置变化（鼠标移上去会亮起来）
                var ldx = p.x - lx, ldy = p.y - ly;
                var lit = clamp(1 - Math.sqrt(ldx * ldx + ldy * ldy) / cfg.lightRange, 0, 1);
                var vLight = lerp(cfg.shadeMin, cfg.shadeMax, lit * lit);

                // 中心辉光
                var distC = Math.sqrt(p.x * p.x + p.y * p.y);
                var glowAmt = smoothstep(1.1, 0, distC) * 0.35 * assembly;

                // 闪烁：整体 shimmer + 每粒子随机 twinkle
                var shimmer = 0.9 + 0.1 * Math.sin(t * 1.5 + p.x * 5 + p.y * 3);
                var twinkle = 0.82 + 0.18 * Math.sin(t * 2.2 + p.phase);
                var alpha = p.bx * (lerp(0.45, 0.75, assembly) + glowAmt) * shimmer * twinkle * Math.min(vLight, 1);
                if (alpha < 0.012) continue;

                var gs = viewScale * 0.012 * cfg.size * (0.65 + 0.5 * p.bx) * (0.9 + 0.15 * shimmer);

                // 应用整体旋转 / 缩放 / 下沉，映射到屏幕坐标
                var rx = p.x * groupScale, ry = p.y * groupScale;
                var rx2 = rx * cosR - ry * sinR;
                var ry2 = rx * sinR + ry * cosR;
                var px3 = W / 2 + rx2 * viewScale;
                var py3 = H / 2 - (ry2 + groupY) * viewScale;

                // 辉光层
                ctx.globalAlpha = alpha * 0.22;
                ctx.fillStyle = cfg.glowColor;
                var gs2 = gs * 2.8;
                ctx.fillRect(px3 - gs2 / 2, py3 - gs2 / 2, gs2, gs2);

                // 核心层：16 档预计算受光色
                var level = clamp(Math.round((vLight - cfg.shadeMin) / (cfg.shadeMax - cfg.shadeMin) * 15), 0, 15);
                ctx.globalAlpha = alpha;
                ctx.fillStyle = p.shades[level];
                ctx.fillRect(px3 - gs / 2, py3 - gs / 2, gs, gs);
            }
            ctx.globalAlpha = 1;
        }

        resize();
        startAt = performance.now();

        window.addEventListener('resize', onResize);
        window.addEventListener('mousemove', onMouseMove, { passive: true });
        window.addEventListener('mouseleave', onMouseLeave);
        window.addEventListener('scroll', onScroll, { passive: true });
        document.addEventListener('visibilitychange', onVisibility);

        var io = null;
        if ('IntersectionObserver' in window) {
            io = new IntersectionObserver(function (entries) {
                if (entries[0] && entries[0].isIntersecting) start();
                else stop();
            }, { rootMargin: '100px' });
            io.observe(stage);
        }
        start();

        return {
            destroy: function () {
                stop();
                window.removeEventListener('resize', onResize);
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseleave', onMouseLeave);
                window.removeEventListener('scroll', onScroll);
                document.removeEventListener('visibilitychange', onVisibility);
                if (io) io.disconnect();
            }
        };
    }

    function boot() {
        var canvas = document.getElementById('heroParticles');
        if (!canvas) return;
        var cfg = (window.config && window.config.HeroParticles) || {};
        if (cfg.enable === false) return;

        var scrollBtn = document.querySelector('.js-hero-scroll');
        if (scrollBtn) {
            scrollBtn.addEventListener('click', function (e) {
                e.preventDefault();
                var target = document.getElementById('container');
                if (target) target.scrollIntoView({ behavior: 'smooth' });
            });
        }

        var done = false;
        var finish = function () {
            if (done) return;
            done = true;
            createStage(canvas, cfg);
        };

        // 等待字体加载完成再采样，避免粒子形状错乱
        if (document.fonts && document.fonts.ready) {
            var timer = setTimeout(finish, 900);
            document.fonts.ready.then(function () { clearTimeout(timer); finish(); });
        } else {
            finish();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
