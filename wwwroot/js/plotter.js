// Interaktiivne graafik: lohista = liiguta, ratas / kaks sõrme = suumi,
// lohista punkti = liigu mööda graafikut (näitab puutujat).
// Vajab math.js-i.
window.Graafik = class Graafik {
    // valikud.interaktiivne = false: ainult vaatamiseks (nt eelvaade salvestatud funktsioonide lehel)
    constructor(louend, valikud = {}) {
        this.c = louend;
        this.ctx = louend.getContext('2d');
        this.vaade = { xMin: -6, xMax: 6, yMin: -4, yMax: 4 };
        this.f = this.d1 = this.d2 = null;
        this.naita = { d1: false, d2: false, puutuja: false, normaal: false, margid: true, sildid: false };
        this.hiirMark = null;     // eriline punkt hiire all – selle silt näidatakse alati
        this.varv = null;         // null | 'f' | 'd1' | 'd2' – värvime graafiku märgi järgi
        this.margid = [];
        this.esile = null;        // null = kõik märgid; muidu massiiv tüüpidest
        this.punkt = 1;           // liigutatava punkti x
        this.naitaPunkti = true;
        this.hiir = null;
        this.onPunkt = null;      // tagasikutse (x) kui punkti liigutatakse
        this.onMark = null;       // tagasikutse (mark, {px, py}) kui erilisele punktile klõpsati
        this._viidud = false;
        this._kursorid = new Map();

        new ResizeObserver(() => this.joonista()).observe(louend);
        if (valikud.interaktiivne !== false) this._seoSundmused();
        else { this.naitaPunkti = false; this.naita.puutuja = false; }
    }

    // ---------- funktsioon ----------
    static koosta(valem) {
        const s = valem.replace(/\bln\(/g, 'log(');
        const solm = math.parse(s);
        return { solm, f: Graafik._arvutaja(solm.compile()) };
    }

    static _arvutaja(kompileeritud) {
        return (x) => {
            try {
                let v = kompileeritud.evaluate({ x });
                if (typeof v === 'object' && v !== null) {
                    if (v.isComplex) { if (Math.abs(v.im) > 1e-9) return NaN; v = v.re; }
                    else return NaN;
                }
                return Number.isFinite(v) ? v : NaN;
            } catch { return NaN; }
        };
    }

    seaFunktsioon(valem) {
        try {
            const { solm, f } = Graafik.koosta(valem);
            this.f = f;
            let d1 = null, d2 = null;
            try {
                const t1 = math.derivative(solm, 'x');
                d1 = Graafik._arvutaja(t1.compile());
                d2 = Graafik._arvutaja(math.derivative(t1, 'x').compile());
            } catch { /* kasutame numbrilist tuletist */ }
            const h = 1e-4;
            this.d1 = d1 || (x => (f(x + h) - f(x - h)) / (2 * h));
            this.d2 = d2 || (x => (f(x + h) - 2 * f(x) + f(x - h)) / (h * h));
        } catch {
            this.f = this.d1 = this.d2 = null;
        }
        this.joonista();
    }

    seaMargid(margid) { this.margid = margid || []; this.joonista(); }

    // Leiab hea vaate: kõik erilised punktid näha, asümptoodid ei venita
    sobitaVaade() {
        if (!this.f) return;

        // Kui erilised punktid on olemas, näitame just neid piirkonda (muidu jääb nt x³ − 3x "lamedaks")
        let margid = this.margid.filter(m => Number.isFinite(m.x) && Number.isFinite(m.y));
        if (margid.length) {
            // perioodiline funktsioon (nt sin x): võtame ainult nullpunkti lähedased punktid
            const lahedal = margid.filter(m => Math.abs(m.x) <= 8);
            if (lahedal.length) margid = lahedal;
            const mx = margid.map(m => m.x), my = margid.map(m => m.y);
            let xMin = Math.min(...mx), xMax = Math.max(...mx);
            const xVaru = Math.max(1.5, (xMax - xMin) * 0.35);
            xMin -= xVaru; xMax += xVaru;
            if (xMax - xMin < 6) { const k = (xMin + xMax) / 2; xMin = k - 3; xMax = k + 3; }
            let yMin = Math.min(0, ...my), yMax = Math.max(0, ...my);
            const yVaru = Math.max(2, (yMax - yMin) * 0.6);
            yMin -= yVaru; yMax += yVaru;
            this.vaade = { xMin, xMax, yMin, yMax };
            this.joonista();
            return;
        }

        let xMin = -5, xMax = 5;
        const ys = [];
        for (let i = 0; i <= 400; i++) {
            const y = this.f(xMin + (xMax - xMin) * i / 400);
            if (Number.isFinite(y)) ys.push(y);
        }
        this.margid.forEach(m => ys.push(m.y));
        ys.sort((a, b) => a - b);
        let yMin = -5, yMax = 5;
        if (ys.length) {
            yMin = ys[Math.floor(ys.length * 0.04)];
            yMax = ys[Math.ceil(ys.length * 0.96) - 1];
            this.margid.forEach(m => { yMin = Math.min(yMin, m.y); yMax = Math.max(yMax, m.y); });
            if (yMax - yMin < 1e-6) { yMin -= 2; yMax += 2; }
            const varu = (yMax - yMin) * 0.15;
            yMin -= varu; yMax += varu;
            // kui x-telg on lähedal, võtame selle ka pildile
            if (yMin > 0 && yMin < (yMax - yMin) * 0.6) yMin = -(yMax - yMin) * 0.08;
            if (yMax < 0 && -yMax < (yMax - yMin) * 0.6) yMax = (yMax - yMin) * 0.08;
        }
        this.vaade = { xMin, xMax, yMin, yMax };
        this.joonista();
    }

    suumi(tegur, px, py) {
        const v = this.vaade;
        const x = px === undefined ? (v.xMin + v.xMax) / 2 : this.xK(px);
        const y = py === undefined ? (v.yMin + v.yMax) / 2 : this.yK(py);
        const uus = {
            xMin: x - (x - v.xMin) * tegur, xMax: x + (v.xMax - x) * tegur,
            yMin: y - (y - v.yMin) * tegur, yMax: y + (v.yMax - y) * tegur
        };
        if (uus.xMax - uus.xMin < 1e-4 || uus.xMax - uus.xMin > 1e5) return;
        this.vaade = uus;
        this.joonista();
    }

    // Võrdne mõõtkava (siis on normaal puutujaga silmnähtavalt risti)
    yksYhele() {
        const v = this.vaade, L = this.L, K = this.K;
        const skaala = (v.xMax - v.xMin) / L;
        const yKesk = (v.yMin + v.yMax) / 2;
        this.vaade.yMin = yKesk - skaala * K / 2;
        this.vaade.yMax = yKesk + skaala * K / 2;
        this.joonista();
    }

    // ---------- koordinaadid ----------
    xP(x) { return (x - this.vaade.xMin) / (this.vaade.xMax - this.vaade.xMin) * this.L; }
    yP(y) { return this.K - (y - this.vaade.yMin) / (this.vaade.yMax - this.vaade.yMin) * this.K; }
    xK(px) { return this.vaade.xMin + px / this.L * (this.vaade.xMax - this.vaade.xMin); }
    yK(py) { return this.vaade.yMin + (this.K - py) / this.K * (this.vaade.yMax - this.vaade.yMin); }

    // ---------- joonistamine ----------
    joonista() {
        if (this._viidud) return;
        this._viidud = true;
        requestAnimationFrame(() => { this._viidud = false; this._joonista(); });
    }

    _joonista() {
        const dpr = window.devicePixelRatio || 1;
        const L = this.c.clientWidth, K = this.c.clientHeight;
        if (!L || !K) return;
        if (this.c.width !== Math.round(L * dpr) || this.c.height !== Math.round(K * dpr)) {
            this.c.width = Math.round(L * dpr);
            this.c.height = Math.round(K * dpr);
        }
        this.L = L; this.K = K;
        const ctx = this.ctx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, L, K);

        const stiil = getComputedStyle(this.c);
        this.vv = {
            vork: stiil.getPropertyValue('--g-vork').trim() || '#f7e8ed',
            telg: stiil.getPropertyValue('--g-telg').trim() || '#334155',
            tekst: stiil.getPropertyValue('--g-tekst').trim() || '#64748b',
            f: stiil.getPropertyValue('--g-f').trim() || '#e11d48',
            d1: stiil.getPropertyValue('--g-d1').trim() || '#7c3aed',
            d2: stiil.getPropertyValue('--g-d2').trim() || '#0891b2',
            taust: stiil.getPropertyValue('--g-taust').trim() || '#ffffff'
        };

        this._vork();
        if (!this.f) return;

        if (this.naita.d2) this._kover(this.d2, this.vv.d2, 2, [2, 4]);
        if (this.naita.d1) this._kover(this.d1, this.vv.d1, 2, [7, 5]);

        const markFn = this.varv === 'f' ? this.f : this.varv === 'd1' ? this.d1 : this.varv === 'd2' ? this.d2 : null;
        this._kover(this.f, this.vv.f, 3, [], markFn);

        this._x0Silt = null;
        if (this.naitaPunkti) this._punkt();
        this._margid();
        this._hiireInfo();
    }

    _samm(vahemik, pikslid) {
        const toores = vahemik / Math.max(2, pikslid / 70);
        const aste = Math.pow(10, Math.floor(Math.log10(toores)));
        const m = toores / aste;
        return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * aste;
    }

    _arv(v) {
        const r = Math.round(v * 1e6) / 1e6;
        return String(r).replace('-', '−');
    }

    _vork() {
        const { ctx, L, K, vaade: v } = this;
        const sx = this._samm(v.xMax - v.xMin, L), sy = this._samm(v.yMax - v.yMin, K);
        ctx.lineWidth = 1;
        ctx.strokeStyle = this.vv.vork;
        ctx.beginPath();
        for (let x = Math.ceil(v.xMin / sx) * sx; x <= v.xMax; x += sx) { const p = Math.round(this.xP(x)) + .5; ctx.moveTo(p, 0); ctx.lineTo(p, K); }
        for (let y = Math.ceil(v.yMin / sy) * sy; y <= v.yMax; y += sy) { const p = Math.round(this.yP(y)) + .5; ctx.moveTo(0, p); ctx.lineTo(L, p); }
        ctx.stroke();

        // teljed
        const x0 = Math.round(this.xP(0)) + .5, y0 = Math.round(this.yP(0)) + .5;
        ctx.strokeStyle = this.vv.telg;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (y0 > 0 && y0 < K) { ctx.moveTo(0, y0); ctx.lineTo(L, y0); }
        if (x0 > 0 && x0 < L) { ctx.moveTo(x0, 0); ctx.lineTo(x0, K); }
        ctx.stroke();

        // nooled ja tähed
        ctx.fillStyle = this.vv.telg;
        ctx.font = 'italic 600 14px Inter, system-ui, sans-serif';
        if (y0 > 0 && y0 < K) {
            ctx.beginPath(); ctx.moveTo(L, y0); ctx.lineTo(L - 9, y0 - 5); ctx.lineTo(L - 9, y0 + 5); ctx.fill();
            ctx.fillText('x', L - 14, y0 - 9);
        }
        if (x0 > 0 && x0 < L) {
            ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 - 5, 9); ctx.lineTo(x0 + 5, 9); ctx.fill();
            ctx.fillText('y', x0 + 8, 14);
        }

        // jaotiste numbrid
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.fillStyle = this.vv.tekst;
        const ty = Math.min(Math.max(y0 + 15, 14), K - 4);
        ctx.textAlign = 'center';
        for (let x = Math.ceil(v.xMin / sx) * sx; x <= v.xMax; x += sx) {
            if (Math.abs(x) < sx / 2) continue;
            const p = this.xP(x);
            if (p < 12 || p > L - 22) continue;
            this._sildiTaust(this._arv(x), p, ty, 'center');
        }
        ctx.textAlign = 'right';
        const tx = Math.min(Math.max(x0 - 6, 30), L - 4);
        for (let y = Math.ceil(v.yMin / sy) * sy; y <= v.yMax; y += sy) {
            if (Math.abs(y) < sy / 2) continue;
            const p = this.yP(y);
            if (p < 22 || p > K - 8) continue;
            this._sildiTaust(this._arv(y), tx, p + 4, 'right');
        }
        if (x0 > 0 && x0 < L && y0 > 0 && y0 < K) { ctx.textAlign = 'right'; ctx.fillText('0', x0 - 5, y0 + 15); }
        ctx.textAlign = 'left';
    }

    _sildiTaust(t, x, y, joondus) {
        const ctx = this.ctx;
        const w = ctx.measureText(t).width;
        const vasak = joondus === 'center' ? x - w / 2 : joondus === 'right' ? x - w : x;
        ctx.save();
        ctx.fillStyle = this.vv.taust;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(vasak - 2, y - 11, w + 4, 14);
        ctx.restore();
        ctx.fillText(t, x, y);
    }

    // Kõver; kui markFn on antud, värvime iga lõigu märgi järgi
    _kover(g, varv, laius, kriips, markFn) {
        const { ctx, L, K } = this;
        const n = Math.ceil(L * 1.5);
        const pos = this.varv === 'd2' ? '#7c3aed' : '#16a34a';
        const neg = this.varv === 'd2' ? '#ea580c' : '#dc2626';

        ctx.lineWidth = laius;
        ctx.setLineDash(kriips);
        ctx.lineJoin = 'round';

        let eelm = null;
        let joon = [];         // [{px,py}] sama värvi jooksev lõik
        let joonVarv = null;

        const lopeta = () => {
            if (joon.length > 1) {
                if (markFn && this.varv === 'f') {
                    // varjutame ala graafiku ja x-telje vahel
                    ctx.save();
                    ctx.globalAlpha = 0.13;
                    ctx.fillStyle = joonVarv;
                    ctx.beginPath();
                    ctx.moveTo(joon[0].px, this.yP(0));
                    joon.forEach(p => ctx.lineTo(p.px, Math.max(-5, Math.min(K + 5, p.py))));
                    ctx.lineTo(joon[joon.length - 1].px, this.yP(0));
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
                ctx.strokeStyle = joonVarv;
                ctx.beginPath();
                ctx.moveTo(joon[0].px, joon[0].py);
                for (let i = 1; i < joon.length; i++) ctx.lineTo(joon[i].px, joon[i].py);
                ctx.stroke();
            }
            joon = [];
        };

        for (let i = 0; i <= n; i++) {
            const px = i / n * L;
            const x = this.xK(px);
            const y = g(x);
            if (!Number.isFinite(y)) { lopeta(); eelm = null; continue; }
            let py = this.yP(y);
            py = Math.max(-K * 2, Math.min(K * 3, py));

            // asümptoot: hüpe üle kogu pildi -> katkestame joone
            if (eelm && Math.abs(py - eelm.py) > K * 1.2 && Math.sign(y) !== Math.sign(eelm.y)) { lopeta(); }

            let v = varv;
            if (markFn) {
                const m = markFn(x);
                v = Number.isFinite(m) ? (m > 1e-9 ? pos : m < -1e-9 ? neg : (joonVarv || varv)) : varv;
            }
            if (joon.length && v !== joonVarv) {
                const viimane = joon[joon.length - 1];
                lopeta();
                joon.push(viimane);
            }
            joonVarv = v;
            joon.push({ px, py });
            eelm = { py, y };
        }
        lopeta();
        ctx.setLineDash([]);
    }

    _sirge(x0, y0, k, varv, kriips) {
        const { ctx, vaade: v } = this;
        ctx.save();
        ctx.strokeStyle = varv;
        ctx.lineWidth = 2;
        ctx.setLineDash(kriips);
        ctx.beginPath();
        if (k === Infinity) {
            ctx.moveTo(this.xP(x0), 0); ctx.lineTo(this.xP(x0), this.K);
        } else {
            ctx.moveTo(0, this.yP(y0 + k * (v.xMin - x0)));
            ctx.lineTo(this.L, this.yP(y0 + k * (v.xMax - x0)));
        }
        ctx.stroke();
        ctx.restore();
    }

    punktiAndmed() {
        const x = this.punkt;
        if (!this.f) return null;
        return { x, y: this.f(x), k: this.d1(x), k2: this.d2(x) };
    }

    _punkt() {
        const a = this.punktiAndmed();
        if (!a || !Number.isFinite(a.y)) return;
        const { ctx } = this;
        const px = this.xP(a.x), py = this.yP(a.y);

        if (Number.isFinite(a.k)) {
            if (this.naita.puutuja) this._sirge(a.x, a.y, a.k, '#0d9488', []);
            if (this.naita.normaal) this._sirge(a.x, a.y, Math.abs(a.k) < 1e-12 ? Infinity : -1 / a.k, '#f59e0b', [6, 4]);
        }

        // abijooned telgedeni
        ctx.save();
        ctx.strokeStyle = '#94a3b8';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py); ctx.lineTo(px, this.yP(0));
        ctx.moveTo(px, py); ctx.lineTo(this.xP(0), py);
        ctx.stroke();
        ctx.restore();

        // Liigutatav punkt näeb välja teistsugune kui leitud punktid: tume rõngas + silt "x₀"
        ctx.beginPath();
        ctx.arc(px, py, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 23, 42, .10)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#0f172a';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();

        ctx.font = '600 12px Inter, system-ui, sans-serif';
        const silt = 'x₀';
        const w = ctx.measureText(silt).width + 10;
        // silt punktist paremale alla – sinna jäävad leitud punktide sildid harva
        let sx = px + 11, sy = py + 9;
        if (sx + w > this.L - 50) sx = px - w - 11;   // paremal servas on tööriistatulp
        if (sy + 18 > this.K - 2) sy = py - 27;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(sx, sy, w, 18, 5) : ctx.rect(sx, sy, w, 18);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(silt, sx + 5, sy + 13);
        this._x0Silt = { x: sx, y: sy, w, h: 18 };   // punktide sildid hoiavad sellest eemale
    }

    static MARGID = {
        null: { varv: '#0284c7', nimi: t('нуль', 'nullkoht') },
        y: { varv: '#475569', nimi: t('ось Oy', 'y-telg') },
        kp: { varv: '#d97706', nimi: t('критическая', 'kriitiline') },
        max: { varv: '#dc2626', nimi: 'max' },
        min: { varv: '#16a34a', nimi: 'min' },
        kaanu: { varv: '#7c3aed', nimi: t('перегиб', 'käänupunkt') }
    };

    _margid() {
        if (!this.naita.margid) return;
        const { ctx } = this;
        const naidatud = this.margid.filter(m => !this.esile || this.esile.includes(m.tuup));
        const sildid = [];
        naidatud.forEach(m => {
            const px = this.xP(m.x), py = this.yP(m.y);
            if (px < -10 || px > this.L + 10 || py < -10 || py > this.K + 10) return;
            const info = Graafik.MARGID[m.tuup] || Graafik.MARGID.kp;
            ctx.beginPath();
            const all = m === this.hiirMark;
            ctx.arc(px, py, all ? 7 : 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.lineWidth = all ? 3 : 2.2;
            ctx.strokeStyle = info.varv;
            ctx.stroke();
            // sildid ainult siis, kui kasutaja need sisse lülitas – või punkt on hiire all
            if ((this.naita.sildid && this.esile) || all) sildid.push({ px, py, m, info });
        });

        // Sildid ei tohi üksteist katta: proovime 4 kohta, kui kõik on hõivatud, jätame sildi ära
        ctx.font = '600 12px Inter, system-ui, sans-serif';
        const votetud = this.naitaPunkti && this._x0Silt ? [this._x0Silt] : [];
        const kattub = (r) => votetud.some(o => r.x < o.x + o.w + 3 && r.x + r.w + 3 > o.x && r.y < o.y + o.h + 2 && r.y + r.h + 2 > o.y);
        sildid.forEach(({ px, py, m, info }) => {
            const t = `${info.nimi} (${this._arv(Math.round(m.x * 100) / 100)}; ${this._arv(Math.round(m.y * 100) / 100)})`;
            const w = ctx.measureText(t).width + 10, h = 19;
            const kohad = [[px + 10, py - 27], [px - w - 10, py - 27], [px + 10, py + 9], [px - w - 10, py + 9], [px + 10, py - 50], [px - w - 10, py - 50], [px + 10, py + 32], [px - w - 10, py + 32]];
            const koht = kohad
                .map(([x, y]) => ({ x, y, w, h }))
                .find(r => r.x >= 0 && r.x + w <= this.L && r.y >= 0 && r.y + h <= this.K && !kattub(r));
            if (!koht) return;
            votetud.push(koht);
            const lx = koht.x, ly = koht.y;
            // peen joon sildist punktini – alati on selge, millise punkti silt see on
            const ankurX = Math.min(Math.max(px, lx), lx + w), ankurY = ly + h / 2;
            ctx.save();
            ctx.strokeStyle = info.varv;
            ctx.globalAlpha = 0.7;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const kaugus = Math.hypot(ankurX - px, ankurY - py) || 1;
            ctx.moveTo(px + (ankurX - px) / kaugus * 6, py + (ankurY - py) / kaugus * 6);   // alustame ringi servast
            ctx.lineTo(ankurX, ankurY);
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = info.varv;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(lx, ly, w, 19, 5) : ctx.rect(lx, ly, w, 19);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(t, lx + 5, ly + 13.5);
        });
    }

    _hiireInfo() {
        if (!this.hiir || this._lohistan) return;
        const x = this.xK(this.hiir.px), y = this.f(x);
        if (!Number.isFinite(y)) return;
        const { ctx } = this;
        const py = this.yP(y);
        ctx.beginPath();
        ctx.arc(this.hiir.px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = this.vv.f;
        ctx.fill();
        ctx.font = '12px Inter, system-ui, sans-serif';
        const t = `x = ${this._arv(Math.round(x * 100) / 100)},  f(x) = ${this._arv(Math.round(y * 1000) / 1000)}`;
        const w = ctx.measureText(t).width + 12;
        ctx.fillStyle = 'rgba(15,23,42,.82)';
        ctx.fillRect(8, this.K - 30, w, 22);
        ctx.fillStyle = '#fff';
        ctx.fillText(t, 14, this.K - 15);
    }

    // ---------- hiir ja puude ----------
    _seoSundmused() {
        const c = this.c;
        c.style.touchAction = 'none';

        const asukoht = (e) => {
            const r = c.getBoundingClientRect();
            return { px: e.clientX - r.left, py: e.clientY - r.top };
        };

        const punktiLahedal = (p) => {
            if (!this.f) return false;
            const a = this.punktiAndmed();
            if (a && Number.isFinite(a.y) && Math.hypot(this.xP(a.x) - p.px, this.yP(a.y) - p.py) < 22) return true;
            const y = this.f(this.xK(p.px));
            return Number.isFinite(y) && Math.abs(this.yP(y) - p.py) < 16;
        };

        // nähtav eriline punkt kursori lähedal
        const margLahedal = (p) => {
            if (!this.naita.margid) return null;
            let parim = null, kaugus = 14;
            for (const m of this.margid) {
                if (this.esile && !this.esile.includes(m.tuup)) continue;
                const d = Math.hypot(this.xP(m.x) - p.px, this.yP(m.y) - p.py);
                if (d < kaugus) { kaugus = d; parim = m; }
            }
            return parim;
        };

        // tõmbab punkti eriliste punktide juurde
        const seaPunkt = (px) => {
            let x = this.xK(px);
            for (const m of this.margid) if (Math.abs(this.xP(m.x) - px) < 9) { x = m.x; break; }
            const samm = this._samm(this.vaade.xMax - this.vaade.xMin, this.L) / 100;
            if (!this.margid.some(m => m.x === x)) x = Math.round(x / samm) * samm;
            this.punkt = Math.round(x * 1e6) / 1e6;
            this.joonista();
            if (this.onPunkt) this.onPunkt(this.punkt);
        };

        c.addEventListener('pointerdown', (e) => {
            c.setPointerCapture(e.pointerId);
            const p = asukoht(e);
            this._kursorid.set(e.pointerId, p);
            if (this._kursorid.size === 2) {
                const [a, b] = [...this._kursorid.values()];
                this._pinch = { kaugus: Math.hypot(a.px - b.px, a.py - b.py) };
                this._lohistan = null;
                return;
            }
            const mark = margLahedal(p);
            if (mark && this.onMark) {
                // klõps erilisel punktil – kui hiir ei liigu, näitame selgitust (vt pointerup)
                this._lohistan = 'marg';
                this._margAlgus = { p, mark };
                return;
            }
            if (this.naitaPunkti && punktiLahedal(p)) {
                this._lohistan = 'punkt';
                c.style.cursor = 'grabbing';
                seaPunkt(p.px);
            } else {
                this._lohistan = 'vaade';
                this._algus = { ...p, vaade: { ...this.vaade } };
                c.style.cursor = 'grabbing';
            }
        });

        c.addEventListener('pointermove', (e) => {
            const p = asukoht(e);
            if (this._kursorid.has(e.pointerId)) this._kursorid.set(e.pointerId, p);

            if (this._pinch && this._kursorid.size === 2) {
                const [a, b] = [...this._kursorid.values()];
                const kaugus = Math.hypot(a.px - b.px, a.py - b.py);
                if (kaugus > 10) {
                    this.suumi(this._pinch.kaugus / kaugus, (a.px + b.px) / 2, (a.py + b.py) / 2);
                    this._pinch.kaugus = kaugus;
                }
                return;
            }
            if (this._lohistan === 'marg') {
                if (Math.hypot(p.px - this._margAlgus.p.px, p.py - this._margAlgus.p.py) > 6) this._lohistan = 'punkt';
                else return;
            }
            if (this._lohistan === 'punkt') { seaPunkt(p.px); return; }
            if (this._lohistan === 'vaade') {
                const v = this._algus.vaade;
                const dx = (p.px - this._algus.px) / this.L * (v.xMax - v.xMin);
                const dy = (p.py - this._algus.py) / this.K * (v.yMax - v.yMin);
                this.vaade = { xMin: v.xMin - dx, xMax: v.xMax - dx, yMin: v.yMin + dy, yMax: v.yMax + dy };
                this.joonista();
                return;
            }
            this.hiir = e.pointerType === 'mouse' ? p : null;
            this.hiirMark = e.pointerType === 'mouse' ? margLahedal(p) : null;
            c.style.cursor = margLahedal(p) && this.onMark ? 'pointer' : this.naitaPunkti && punktiLahedal(p) ? 'grab' : 'move';
            this.joonista();
        });

        const lopp = (e) => {
            if (e.type === 'pointerup' && this._lohistan === 'marg' && this.onMark) this.onMark(this._margAlgus.mark, asukoht(e));
            this._kursorid.delete(e.pointerId);
            if (this._kursorid.size < 2) this._pinch = null;
            if (this._kursorid.size === 0) { this._lohistan = null; c.style.cursor = ''; }
        };
        c.addEventListener('pointerup', lopp);
        c.addEventListener('pointercancel', lopp);
        c.addEventListener('pointerleave', () => { this.hiir = null; this.hiirMark = null; this.joonista(); });

        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const p = asukoht(e);
            this.suumi(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.px, p.py);
        }, { passive: false });

        c.addEventListener('dblclick', () => this.sobitaVaade());
    }
};
