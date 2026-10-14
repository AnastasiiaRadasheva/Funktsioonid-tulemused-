// Joonistab f(x) (sinine), f'(x) (punane katkendjoon), puutuja (roheline) ja normaali (oranž).
(function () {
    const louend = document.getElementById('funktsiooniGraafik');
    if (!louend) return;

    const id = louend.dataset.id;
    const valem = louend.dataset.valem;
    const tuletis = louend.dataset.tuletis;
    const vigaEl = document.getElementById('graafikuViga');
    let graafik = null;
    let sirged = null;   // { x0, y0, k, b, kn, bn, puutujaVertikaalne, normaalVertikaalne }

    // legendi tekst loetavaks: (x^2-3)*exp(-x) -> (x²−3)·e^(−x)
    const astmed = { '2': '²', '3': '³', '4': '⁴', '5': '⁵' };
    const ilusSilt = (s) => s
        .replace(/exp\(([^()]*)\)/g, 'e^($1)')
        .replace(/\^([2-5])(?!\d)/g, (_, a) => astmed[a])
        .replace(/\s*\*\s*/g, '·')
        .replace(/-/g, '−');

    const teljeVarv =(c) => (c.tick.value === 0 ? '#3b1a28' : '#f6e4ea');

    // sirge punktid graafiku laiuses
    function sirgePunktid(k, b, vertikaalne, x0, min, max, yMin, yMax) {
        if (vertikaalne) return [{ x: x0, y: yMin }, { x: x0, y: yMax }];
        return [{ x: min, y: k * min + b }, { x: max, y: k * max + b }];
    }

    async function joonista() {
        const min = parseFloat(document.getElementById('xMin').value);
        const max = parseFloat(document.getElementById('xMax').value);
        const samm = parseFloat(document.getElementById('samm').value);
        vigaEl.textContent = '';

        if (!(min < max) || !(samm > 0)) {
            vigaEl.textContent = t('x min должен быть меньше x max, а шаг больше 0.', 'x min peab olema väiksem kui x max ja samm suurem kui 0.');
            return;
        }

        const vastus = await fetch(`/Funktsioonid/Punktid/${id}?min=${min}&max=${max}&samm=${samm}`);
        if (!vastus.ok) {
            vigaEl.textContent = await vastus.text();
            return;
        }
        const punktid = await vastus.json();

        const fAndmed = punktid.map(p => ({ x: p.x, y: p.y }));
        const dfAndmed = punktid.map(p => ({ x: p.x, y: p.dy }));

        // y-telje ulatus f ja f' järgi (puutuja/normaal ei venita graafikut)
        // äärmuslikud väärtused (nt e^(−x) vasakul servas) ei tohi kogu graafikut lamedaks suruda:
        // Tukey reegel: kvartiilid ± 1,5 · kvartiilide vahe – kõrvalekalduvad väärtused jäävad pildist välja
        const fVaartused = punktid.map(p => p.y).filter(v => v !== null && isFinite(v)).sort((a, b) => a - b);
        const protsentiil = (q) => fVaartused[Math.min(fVaartused.length - 1, Math.max(0, Math.round(q * (fVaartused.length - 1))))];
        let yMin = -5, yMax = 5;
        if (fVaartused.length) {
            const q1 = protsentiil(0.25), q3 = protsentiil(0.75), iqr = Math.max(q3 - q1, 1);
            yMin = Math.max(fVaartused[0], q1 - 1.5 * iqr);
            yMax = Math.min(fVaartused[fVaartused.length - 1], q3 + 1.5 * iqr);
            if (yMax - yMin < 2) { yMin -= 1; yMax += 1; }
            const varu = (yMax - yMin) * 0.12;
            yMin = Math.min(yMin - varu, 0);
            yMax = Math.max(yMax + varu, 0);
        }
        if (yMin === yMax) { yMin -= 1; yMax += 1; }
        const varu = (yMax - yMin) * 0.08;
        yMin -= varu; yMax += varu;

        const andmestikud = [
            {
                label: `f(x) = ${ilusSilt(valem)}`,
                data: fAndmed,
                borderColor: '#e11d48',
                backgroundColor: '#e11d48',
                borderWidth: 2.5,
                pointRadius: 0,
                tension: 0.2,
                spanGaps: false
            },
            {
                label: `f'(x) = ${ilusSilt(tuletis)}`,
                data: dfAndmed,
                borderColor: '#7c3aed',
                backgroundColor: '#7c3aed',
                borderWidth: 2,
                borderDash: [6, 6],
                pointRadius: 0,
                tension: 0.2,
                spanGaps: false
            }
        ];

        if (sirged) {
            andmestikud.push({
                label: t('Касательная', 'Puutuja'),
                data: sirgePunktid(sirged.k, sirged.b, sirged.puutujaVertikaalne, sirged.x0, min, max, yMin, yMax),
                borderColor: '#2a9d8f',
                backgroundColor: '#2a9d8f',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0
            });
            andmestikud.push({
                label: t('Нормаль', 'Normaal'),
                data: sirgePunktid(sirged.kn, sirged.bn, sirged.normaalVertikaalne, sirged.x0, min, max, yMin, yMax),
                borderColor: '#f4a261',
                backgroundColor: '#f4a261',
                borderWidth: 2,
                borderDash: [3, 4],
                pointRadius: 0,
                tension: 0
            });
            andmestikud.push({
                label: t('Точка касания', 'Puutepunkt'),
                data: [{ x: sirged.x0, y: sirged.y0 }],
                borderColor: '#1b2433',
                backgroundColor: '#1b2433',
                pointRadius: 5,
                showLine: false
            });
        }

        if (graafik) graafik.destroy();

        graafik = new Chart(louend, {
            type: 'line',
            data: { datasets: andmestikud },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: 'nearest', axis: 'x', intersect: false },
                scales: {
                    x: { type: 'linear', min, max, title: { display: true, text: 'x' }, grid: { color: teljeVarv } },
                    y: { min: yMin, max: yMax, ticks: { includeBounds: false }, title: { display: true, text: 'y' }, grid: { color: teljeVarv } }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: (el) => `x = ${Number(el[0].parsed.x.toFixed(3))}`,
                            label: (c) => `${c.dataset.label.split(' =')[0]} = ${c.parsed.y.toFixed(3)}`
                        }
                    }
                }
            }
        });
    }

    // Details lehelt: näita puutujat ja normaali graafikul
    window.naitaSirgeid = function (tulemus) {
        sirged = tulemus;
        joonista();
    };

    document.getElementById('joonistaNupp').addEventListener('click', joonista);
    joonista();
})();
