// Avalehe kalkulaator: sisestus, klaviatuur, parameetrid, "mida leida" valik, tulemused ja graafik.
// Tekstid on kahes keeles: t('vene', 'eesti') – vt _Layout.cshtml.
(function () {
    const juur = document.getElementById('kalk');
    const mf = document.getElementById('valem');
    const vigaEl = document.getElementById('viga');
    const tulemusEl = document.getElementById('tulemus');
    const pealkiriEl = document.getElementById('tulemusPealkiri');
    const lisaSisend = document.getElementById('lisaSisend');
    const x0Vali = document.getElementById('x0Vali');
    const x0Silt = document.getElementById('x0Silt');
    const liugur = document.getElementById('liugur');
    const uurijaInfo = document.getElementById('uurijaInfo');
    const legendEl = document.getElementById('legend');

    const graafik = new Graafik(document.getElementById('graafik'));

    // brauseri mälu (võib olla keelatud – siis lihtsalt ei mäleta)
    const mali = {
        loe(voti, vaikimisi) { try { const v = localStorage.getItem(voti); return v === null ? vaikimisi : JSON.parse(v); } catch { return vaikimisi; } },
        kirjuta(voti, v) { try { localStorage.setItem(voti, JSON.stringify(v)); } catch { } }
    };

    const olek = {
        toores: '',           // valem nii, nagu kasutaja kirjutas (võib sisaldada parameetreid a, b, c …)
        valem: '',            // parameetrid asendatud – see läheb serverisse
        param: {},            // { a: 1, b: -2 }
        analuus: null,        // serveri vastus
        leia: juur.dataset.leia || 'koik',
        x0: 1,
        sobitatud: '',        // millise valemi jaoks vaade on sobitatud
        lahti: new Set(),     // tabelis avatud read
        ise: mali.loe('ise', false),
        haaval: mali.loe('haaval', false),
        keri: false,          // pärast järgmist arvutust keri graafiku juurde
        taasta: null          // keele vahetuse järel taastatav olek
    };

    // ================= VALIKUD =================
    const VALIKUD = [
        { voti: 'koik', nimi: t('Всё сразу', 'Kõik korraga'), ikoon: '▦', esile: ['null', 'y', 'max', 'min', 'kaanu'],
          selgitus: t('Полное исследование функции в одной таблице. Нажмите на строку, чтобы увидеть, как получен ответ.', 'Funktsiooni täielik uurimine ühes tabelis. Klõpsa real, et näha, kuidas vastus leiti.') },
        { voti: 'mp', nimi: t('Область определения', 'Määramispiirkond'), ikoon: 'X', esile: [],
          selgitus: t('Все значения x, при которых функцию можно вычислить: нет деления на ноль, под корнем чётной степени нет отрицательного числа, под логарифмом — положительное число.', 'Kõik x väärtused, mille korral funktsiooni saab arvutada: nulliga ei jagata, paarisjuure all pole negatiivset arvu, logaritmi all on positiivne arv.') },
        { voti: 'y', nimi: t('Пересечение с осью Oy', 'Lõikepunkt y-teljega'), ikoon: '↕', esile: ['y'],
          selgitus: t('Точка, где график пересекает ось Oy. Чтобы её найти, считаем f(0).', 'Punkt, kus graafik lõikab y-telge. Selle leidmiseks arvutame f(0).') },
        { voti: 'null', nimi: t('Нули функции', 'Nullkohad'), ikoon: '0', esile: ['null'],
          selgitus: t('Значения x, при которых f(x) = 0. В этих точках график пересекает ось Ox.', 'x väärtused, mille korral f(x) = 0. Nendes kohtades lõikab graafik x-telge.') },
        { voti: 'marg', nimi: t('Знакопостоянство', 'Positiivsus ja negatiivsus'), ikoon: '±', esile: ['null'], varv: 'f',
          selgitus: t('Где график выше оси Ox (f(x) > 0) и где ниже (f(x) < 0).', 'Kus on graafik x-telje kohal (f(x) > 0, X⁺) ja kus x-telje all (f(x) < 0, X⁻).') },
        { voti: 't1', nimi: t("Производная f'(x)", "Tuletis f'(x)"), ikoon: "f'", esile: ['kp', 'max', 'min'], d1: true,
          selgitus: t("Производная показывает, как быстро и в какую сторону меняется функция. f'(x₀) — угловой коэффициент касательной в точке x₀.", "Tuletis näitab, kui kiiresti ja mis suunas funktsioon muutub. f'(x₀) on puutuja tõus punktis x₀.") },
        { voti: 'kp', nimi: t('Критические точки', 'Kriitilised punktid'), ikoon: '•', esile: ['kp', 'max', 'min'], d1: true,
          selgitus: t("Точки, где f'(x) = 0. Там касательная горизонтальна, и там может быть максимум или минимум.", "Punktid, kus f'(x) = 0. Seal on puutuja horisontaalne ja seal võib olla maksimum või miinimum.") },
        { voti: 'mon', nimi: t('Возрастание и убывание', 'Kasvamine ja kahanemine'), ikoon: '↗︎', esile: ['kp', 'max', 'min'], varv: 'd1',
          selgitus: t("Где график идёт вверх (f'(x) > 0) и где вниз (f'(x) < 0).", "Kus graafik tõuseb (f'(x) > 0) ja kus langeb (f'(x) < 0).") },
        { voti: 'ekst', nimi: t('Экстремумы', 'Ekstreemumid'), ikoon: '▲', esile: ['max', 'min'], varv: 'd1',
          selgitus: t('«Вершины» графика (локальный максимум) и «впадины» (локальный минимум).', 'Graafiku „mäetipud“ (lokaalne maksimum) ja „orud“ (lokaalne miinimum).') },
        { voti: 't2', nimi: t("Вторая производная f''(x)", "Teine tuletis f''(x)"), ikoon: "f''", esile: ['kaanu'], d2: true,
          selgitus: t('Производная от производной. Её знак показывает, как изгибается график.', 'Tuletise tuletis. Selle märk näitab, kuidas graafik kõverdub.') },
        { voti: 'kum', nimi: t('Выпуклость и вогнутость', 'Kumerus ja nõgusus'), ikoon: '∩', esile: ['kaanu'], varv: 'd2',
          selgitus: t("Где график выпуклый ∩ (f''(x) < 0) и где вогнутый ∪ (f''(x) > 0).", "Kus graafik on kumer ∩ (f''(x) < 0) ja kus nõgus ∪ (f''(x) > 0).") },
        { voti: 'kaanu', nimi: t('Точки перегиба', 'Käänupunktid'), ikoon: '∿', esile: ['kaanu'], varv: 'd2',
          selgitus: t("Точки, где график меняет направление изгиба (∩ ↔ ∪). Там f''(x) = 0 и меняет знак.", "Punktid, kus graafik muudab kõverdumise suunda (∩ ↔ ∪). Seal f''(x) = 0 ja muudab märki.") },
        { voti: 'puut', nimi: t('Касательная и нормаль', 'Puutuja ja normaal'), ikoon: '⟋', esile: [], vajab: 'x₀', puutuja: true, normaal: true,
          selgitus: t('Касательная — прямая, которая касается графика в точке x₀. Нормаль перпендикулярна касательной.', 'Puutuja on sirge, mis puudutab graafikut punktis x₀. Normaal on puutujaga risti.') },
        { voti: 'vaart', nimi: t('Значение в точке f(a)', 'Väärtus punktis f(a)'), ikoon: '=', esile: [], vajab: 'a', puutuja: false,
          selgitus: t('Считаем значение функции в конкретной точке: подставляем число вместо x.', 'Arvutame funktsiooni väärtuse kindlas punktis: asendame x-i arvuga.') }
    ];
    const valik = (v) => VALIKUD.find(x => x.voti === v) || VALIKUD[0];

    // Valikud teemade kaupa – nii on kohe näha, mis millega seotud on
    const GRUPID = [
        { nimi: t('Основное', 'Põhiline'), votmed: ['mp', 'y', 'null', 'marg'] },
        { nimi: t('Первая производная', 'Esimene tuletis'), votmed: ['t1', 'kp', 'mon', 'ekst'] },
        { nimi: t('Вторая производная', 'Teine tuletis'), votmed: ['t2', 'kum', 'kaanu'] },
        { nimi: t('В конкретной точке', 'Kindlas punktis'), votmed: ['puut', 'vaart'] }
    ];
    const valikuNupp = (v) => `
        <button type="button" class="valik" role="tab" data-voti="${v.voti}" title="${Valem.esc(v.selgitus)}">
            <span class="valik-ikoon">${Valem.esc(v.ikoon)}</span><span>${Valem.esc(v.nimi)}</span>
        </button>`;

    const valikudEl = document.getElementById('valikud');
    valikudEl.innerHTML = `<div class="valik-koik">${valikuNupp(valik('koik'))}<span class="vihje">${t('или выберите один пункт — увидите только его решение:', 'või vali üks punkt – näed ainult selle lahendust:')}</span></div>
        <div class="valikugrupid">${GRUPID.map(g => `
            <div class="valikugrupp">
                <div class="valikugrupi-pea">${Valem.esc(g.nimi)}</div>
                ${g.votmed.map(k => valikuNupp(valik(k))).join('')}
            </div>`).join('')}
        </div>`;
    valikudEl.addEventListener('click', e => {
        const n = e.target.closest('.valik');
        if (n) valiLeia(n.dataset.voti, true);
    });

    function valiLeia(voti, kerida) {
        olek.leia = valik(voti).voti;
        valikudEl.querySelectorAll('.valik').forEach(n => {
            const on = n.dataset.voti === olek.leia;
            n.classList.toggle('valitud', on);
            n.setAttribute('aria-selected', on);
        });
        const v = valik(olek.leia);

        // graafiku seaded selle valiku järgi
        graafik.esile = v.esile;
        graafik.varv = v.varv || null;
        seaLuliti('naitaD1', !!v.d1, 'd1');
        seaLuliti('naitaD2', !!v.d2, 'd2');
        // puutuja on vaikimisi väljas – sisse ainult režiimis "Puutuja ja normaal" (või kui kasutaja ise lülitab)
        seaLuliti('naitaPuutuja', !!v.puutuja, 'puutuja');
        seaLuliti('naitaNormaal', !!v.normaal, 'normaal');
        naitaLegendi();
        graafik.joonista();

        lisaSisend.hidden = !v.vajab;
        if (v.vajab) x0Silt.textContent = v.vajab + ' =';

        uuendaUrl();
        naitaTulemust();
        if (v.vajab) laePunktiLahendus();
        if (kerida && window.innerWidth < 992) document.getElementById('vastuskaart').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function seaLuliti(id, vaartus, voti) {
        document.getElementById(id).checked = vaartus;
        graafik.naita[voti] = vaartus;
    }

    // ================= KLAVIATUUR =================
    // Vasak pool vahetub vahekaartide kaupa (põhiline, funktsioonid, parameetrid, mallid),
    // numbrid ja liikumisnupud paremal on alati näha.
    const k = (l, kask, tooltip, c) => ({ l, k: kask, t: tooltip, c });
    const ins = (latex) => ['insert', latex];
    const kirj = (tekst) => ['typedText', tekst];

    const VAHEKAARDID = [
        {
            id: 'pohi', nimi: t('Основные', 'Põhiline'), ikoon: '123',
            klahvid: [
                k('<i>x</i>', kirj('x'), t('Переменная x', 'Muutuja x')),
                k('<i>x</i><sup>2</sup>', ins('#@^{2}'), t('Квадрат (x²)', 'Ruut (x²)')),
                k('<i>x</i><sup>□</sup>', ins('#@^{#?}'), t('Степень (клавиша ^)', 'Aste (klahv ^)')),
                k('<span class="murd"><span>□</span><span>□</span></span>', ins('\\frac{#@}{#?}'), t('Дробь (клавиша /)', 'Murd (klahv /)')),
                k('√□', ins('\\sqrt{#0}'), t('Квадратный корень', 'Ruutjuur')),
                k('<sup>n</sup>√□', ins('\\sqrt[#?]{#0}'), t('Корень n-й степени', 'n-es juur')),
                k('(', kirj('('), t('Открыть скобку', 'Sulg lahti')),
                k(')', kirj(')'), t('Закрыть скобку', 'Sulg kinni')),
                k('sin', ins('\\sin\\left(#0\\right)'), t('Синус', 'Siinus')),
                k('cos', ins('\\cos\\left(#0\\right)'), t('Косинус', 'Koosinus')),
                k('tan', ins('\\tan\\left(#0\\right)'), t('Тангенс', 'Tangens')),
                k('ln', ins('\\ln\\left(#0\\right)'), t('Натуральный логарифм', 'Naturaallogaritm')),
                k('e<sup>□</sup>', ins('e^{#0}'), t('e в степени', 'e astmes')),
                k('π', ins('\\pi'), t('Пи ≈ 3,14', 'Pii ≈ 3,14')),
                k('<i>a</i>', kirj('a'), t('Параметр a — появится ползунок', 'Parameeter a – ilmub liugur')),
                k(',', kirj('.'), t('Запятая (десятичная дробь)', 'Koma (kümnendmurd)'))
            ]
        },
        {
            id: 'funk', nimi: t('Функции', 'Funktsioonid'), ikoon: 'f(x)',
            klahvid: [
                k('sin', ins('\\sin\\left(#0\\right)'), t('Синус', 'Siinus')),
                k('cos', ins('\\cos\\left(#0\\right)'), t('Косинус', 'Koosinus')),
                k('tan', ins('\\tan\\left(#0\\right)'), t('Тангенс', 'Tangens')),
                k('ln', ins('\\ln\\left(#0\\right)'), t('Натуральный логарифм', 'Naturaallogaritm')),
                k('e<sup>□</sup>', ins('e^{#0}'), t('Экспонента eˣ', 'Eksponent eˣ')),
                k('<i>e</i>', ins('e'), t('Число e ≈ 2,718', 'Arv e ≈ 2,718')),
                k('π', ins('\\pi'), t('Пи ≈ 3,14', 'Pii ≈ 3,14')),
                k('√□', ins('\\sqrt{#0}'), t('Квадратный корень', 'Ruutjuur')),
                k('∛□', ins('\\sqrt[3]{#0}'), t('Кубический корень', 'Kuupjuur')),
                k('<sup>n</sup>√□', ins('\\sqrt[#?]{#0}'), t('Корень n-й степени', 'n-es juur')),
                k('<i>x</i><sup>2</sup>', ins('#@^{2}'), t('Квадрат', 'Ruut')),
                k('<i>x</i><sup>3</sup>', ins('#@^{3}'), t('Куб', 'Kuup')),
                k('<i>x</i><sup>□</sup>', ins('#@^{#?}'), t('Любая степень', 'Suvaline aste')),
                k('<span class="murd"><span>1</span><span>□</span></span>', ins('\\frac{1}{#0}'), t('Единица делить на …', 'Üks jagatud …')),
                k('(', kirj('('), t('Открыть скобку', 'Sulg lahti')),
                k(')', kirj(')'), t('Закрыть скобку', 'Sulg kinni'))
            ]
        },
        {
            id: 'param', nimi: t('Параметры', 'Parameetrid'), ikoon: 'abc',
            vihje: t('Буквы — это параметры: для каждой появится ползунок, и график можно «двигать».', 'Tähed on parameetrid: igaühele tekib liugur ja graafikut saab „liigutada“.'),
            klahvid: [
                ...'abcdkmnp'.split('').map(p => k(`<i>${p}</i>`, kirj(p), t(`Параметр ${p}`, `Parameeter ${p}`))),
                k('<i>x</i>', kirj('x'), t('Переменная x', 'Muutuja x')),
                k('<i>x</i><sup>2</sup>', ins('#@^{2}'), t('Квадрат', 'Ruut')),
                k('<i>x</i><sup>□</sup>', ins('#@^{#?}'), t('Степень', 'Aste')),
                k('<span class="murd"><span>□</span><span>□</span></span>', ins('\\frac{#@}{#?}'), t('Дробь', 'Murd')),
                k('sin', ins('\\sin\\left(#0\\right)'), t('Синус', 'Siinus')),
                k('e<sup>□</sup>', ins('e^{#0}'), t('e в степени', 'e astmes')),
                k('(', kirj('('), t('Открыть скобку', 'Sulg lahti')),
                k(')', kirj(')'), t('Закрыть скобку', 'Sulg kinni'))
            ]
        },
        {
            id: 'mall', nimi: t('Шаблоны', 'Mallid'), ikoon: '□+□',
            vihje: t('Шаблон вставляет готовую форму — впишите числа в пустые клетки (→ или Tab — к следующей клетке).', 'Mall lisab valmis kuju – kirjuta tühjadesse lahtritesse arvud (→ või Tab – järgmisse lahtrisse).'),
            lai: true,
            klahvid: [
                k('□<i>x</i> + □', ins('\\placeholder{}x+\\placeholder{}'), t('Линейная функция kx + b', 'Lineaarfunktsioon kx + b')),
                k('□<i>x</i>² + □<i>x</i> + □', ins('\\placeholder{}x^2+\\placeholder{}x+\\placeholder{}'), t('Квадратичная функция', 'Ruutfunktsioon')),
                k('□<i>x</i>³ + □<i>x</i>² + □<i>x</i> + □', ins('\\placeholder{}x^3+\\placeholder{}x^2+\\placeholder{}x+\\placeholder{}'), t('Кубическая функция', 'Kuupfunktsioon')),
                k('□<i>x</i>⁴ + □<i>x</i>² + □', ins('\\placeholder{}x^4+\\placeholder{}x^2+\\placeholder{}'), t('Биквадратная функция', 'Bikvadraatfunktsioon')),
                k('(<i>x</i> − □)(<i>x</i> − □)', ins('\\left(x-\\placeholder{}\\right)\\left(x-\\placeholder{}\\right)'), t('Произведение скобок (нули сразу видны)', 'Sulgude korrutis (nullkohad on kohe näha)')),
                k('<span class="murd"><span>□</span><span>□</span></span>', ins('\\frac{\\placeholder{}}{\\placeholder{}}'), t('Дробь (рациональная функция)', 'Murd (ratsionaalfunktsioon)')),
                k('□ · e<sup><i>x</i></sup>', ins('\\placeholder{}\\cdot e^{x}'), t('Многочлен на экспоненту', 'Polünoom korda eksponent')),
                k('ln(□) / □', ins('\\frac{\\ln\\left(\\placeholder{}\\right)}{\\placeholder{}}'), t('Логарифм в дроби', 'Logaritm murrus'))
            ]
        }
    ];

    const PAREMAL = {
        numbrid: [
            k('7', kirj('7')), k('8', kirj('8')), k('9', kirj('9')), k('÷', ins('\\div'), t('Деление', 'Jagamine'), 'op'),
            k('4', kirj('4')), k('5', kirj('5')), k('6', kirj('6')), k('×', ins('\\cdot'), t('Умножение', 'Korrutamine'), 'op'),
            k('1', kirj('1')), k('2', kirj('2')), k('3', kirj('3')), k('−', kirj('-'), t('Вычитание', 'Lahutamine'), 'op'),
            k('0', kirj('0'), '', 'lai'), k('+', kirj('+'), t('Сложение', 'Liitmine'), 'op lai')
        ],
        liikumine: [
            k('←', 'moveToPreviousChar', t('Курсор влево', 'Kursor vasakule'), 'juht'),
            k('→', 'moveToNextChar', t('Курсор вправо (и выход из степени, дроби, корня)', 'Kursor paremale (ja välja astmest, murrust, juurest)'), 'juht'),
            k('⌫', 'deleteBackward', t('Стереть', 'Kustuta'), 'juht'),
            k('C', 'tyhjenda', t('Очистить всё', 'Tühjenda kõik'), 'juht ohtlik'),
            k('↶', 'undo', t('Отменить', 'Võta tagasi'), 'juht'),
            k('↷', 'redo', t('Повторить', 'Tee uuesti'), 'juht'),
            k(t('Посчитать', 'Arvuta'), 'arvuta', t('Посчитать и показать график (Enter)', 'Arvuta ja näita graafikut (Enter)'), 'arvuta')
        ]
    };

    const klaviatuur = document.getElementById('klaviatuur');
    const klahvid = [];
    const nupp = (x) => {
        klahvid.push(x);
        return `<button type="button" class="klahv ${x.c || ''}" data-i="${klahvid.length - 1}" title="${Valem.esc(x.t || x.l.replace(/<[^>]+>/g, ''))}">${x.l}</button>`;
    };
    let aktiivneKaart = mali.loe('klavKaart', 'pohi');
    if (!VAHEKAARDID.some(v => v.id === aktiivneKaart)) aktiivneKaart = 'pohi';

    klaviatuur.innerHTML = `
        <div class="klav-kaardid" role="tablist" aria-label="${t('Разделы клавиатуры', 'Klaviatuuri osad')}">
            ${VAHEKAARDID.map(v => `<button type="button" role="tab" class="klav-kaart" data-kaart="${v.id}" aria-selected="${v.id === aktiivneKaart}">
                <span class="klav-kaart-ikoon">${v.ikoon}</span>${Valem.esc(v.nimi)}</button>`).join('')}
        </div>
        <div class="klav-vasak">
            ${VAHEKAARDID.map(v => `<div class="klav-paneel${v.lai ? ' lai' : ''}" data-paneel="${v.id}" role="tabpanel" ${v.id === aktiivneKaart ? '' : 'hidden'}>
                ${v.klahvid.map(nupp).join('')}
                ${v.vihje ? `<p class="klav-vihje">${Valem.esc(v.vihje)}</p>` : ''}
            </div>`).join('')}
        </div>
        <div class="klav-grupp numbrid">${PAREMAL.numbrid.map(nupp).join('')}</div>
        <div class="klav-grupp liikumine">${PAREMAL.liikumine.map(nupp).join('')}</div>`;

    klaviatuur.addEventListener('pointerdown', e => { if (e.target.closest('.klahv, .klav-kaart')) e.preventDefault(); });
    klaviatuur.addEventListener('click', e => {
        const kaart = e.target.closest('.klav-kaart');
        if (kaart) {
            aktiivneKaart = kaart.dataset.kaart;
            mali.kirjuta('klavKaart', aktiivneKaart);
            klaviatuur.querySelectorAll('.klav-kaart').forEach(b => b.setAttribute('aria-selected', b.dataset.kaart === aktiivneKaart));
            klaviatuur.querySelectorAll('.klav-paneel').forEach(p => { p.hidden = p.dataset.paneel !== aktiivneKaart; });
            return;
        }
        const n = e.target.closest('.klahv');
        if (!n) return;
        const kask = klahvid[+n.dataset.i].k;
        if (kask === 'arvuta') { olek.keri = true; analuusi(true); return; }
        if (kask === 'tyhjenda') mf.value = '';
        // malli täitmisel viib → järgmisse tühja lahtrisse, muidu liigutab kursorit ühe märgi võrra
        else if (kask === 'moveToNextChar' && mf.value.includes('\\placeholder')) mf.executeCommand('moveToNextPlaceholder');
        else mf.executeCommand(kask);
        mf.focus();
        sisestusMuutus();
    });
    const klavLuliti = document.getElementById('klavLuliti');
    function naitaKlaviatuuri(naita) {
        klaviatuur.hidden = !naita;
        klavLuliti.textContent = naita ? t('Скрыть клавиатуру', 'Peida klaviatuur') : t('Показать клавиатуру', 'Näita klaviatuuri');
    }
    klavLuliti.addEventListener('click', () => {
        naitaKlaviatuuri(klaviatuur.hidden);
        mali.kirjuta('klavPeidus', klaviatuur.hidden);
    });
    naitaKlaviatuuri(!mali.loe('klavPeidus', false));

    // MathLive-i enda hüpikklaviatuuri pole vaja – meil on oma
    mf.mathVirtualKeyboardPolicy = 'manual';
    mf.addEventListener('focus', () => {
        // puuteekraanil ei ava telefoni enda klaviatuuri, kui meie klaviatuur on näha
        const sisend = mf.shadowRoot && mf.shadowRoot.querySelector('[part="keyboard-sink"], textarea');
        if (sisend && matchMedia('(pointer: coarse)').matches && !klaviatuur.hidden) sisend.setAttribute('inputmode', 'none');
    });

    // ================= PARAMEETRID (a, b, c …) =================
    const FUNKTSIOONID = ['sqrt', 'sin', 'cos', 'tan', 'exp', 'ln'];
    const IKOON_MANGI = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
    const IKOON_PAUS = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>';

    // Leiab valemist tähed peale x-i (funktsioonide nimed ei loe)
    function leiaParameetrid(valem) {
        let s = valem;
        FUNKTSIOONID.forEach(f => { s = s.split(f).join(' '); });
        return [...new Set(s.match(/[a-wyz]/g) || [])].sort();
    }

    // Asendab parameetrid arvudega ja korrastab tulemuse: a*x^2+b*x+c (a=1, b=-2, c=-3) -> x^2-2*x-3
    function asendaParameetrid(valem) {
        let s = valem;
        FUNKTSIOONID.forEach((f, i) => { s = s.split(f).join('\u0001' + i + '\u0001'); });
        s = s.replace(/[a-wyz]/g, (p, koht, kogu) => {
            const v = Math.round((olek.param[p] ?? 1) * 1000) / 1000;
            const arv = v < 0 ? '(' + v + ')' : String(v);
            // 2a -> 2*2, xa -> x*2 (muidu tuleks 22)
            const eel = kogu[koht - 1];
            const jarg = kogu[koht + 1];
            return (eel && /[\d.)x]/.test(eel) ? '*' : '') + arv + (jarg && /[\d.(a-z\u0001]/.test(jarg) ? '*' : '');
        });
        s = s.replace(/\u0001(\d)\u0001/g, (_, i) => FUNKTSIOONID[+i]);
        return s
            .replace(/\+\(-([\d.]+)\)/g, '-$1')            // +(-2) -> -2
            .replace(/-\(-([\d.]+)\)/g, '+$1')             // -(-2) -> +2
            .replace(/^\(-([\d.]+)\)/, '-$1')              // (-2)*x alguses -> -2*x
            .replace(/(^|[+\-(])1\*(?=[a-z(])/g, '$1')     // 1*x -> x
            .replace(/^\+/, '');
    }

    const paramKast = document.getElementById('parameetrid');
    const paramRead = document.getElementById('paramRead');
    let naidatudParam = '';
    const animatsioon = {};

    function uuendaParameetreid() {
        const nimed = leiaParameetrid(olek.toores);
        nimed.forEach(p => { if (!(p in olek.param)) olek.param[p] = 1; });
        paramKast.hidden = nimed.length === 0;
        const voti = nimed.join(',');
        if (voti === naidatudParam) return;
        naidatudParam = voti;
        Object.keys(animatsioon).forEach(peataAnimatsioon);
        paramRead.innerHTML = nimed.map(p => `
            <div class="param" data-p="${p}">
                <span class="param-nimi">${p}</span>
                <button type="button" class="param-mangi" title="${t('Анимация', 'Animatsioon')}">${IKOON_MANGI}</button>
                <input type="range" min="-10" max="10" step="0.1" value="${olek.param[p]}" aria-label="${p}" />
                <input type="number" step="0.1" value="${olek.param[p]}" aria-label="${p}" />
            </div>`).join('');
    }

    function seaParameeter(p, v, allikas) {
        if (!Number.isFinite(v)) return;
        olek.param[p] = v;
        const rida = paramRead.querySelector(`[data-p="${p}"]`);
        if (rida) {
            if (allikas !== 'liugur') rida.querySelector('input[type=range]').value = v;
            if (allikas !== 'arv') rida.querySelector('input[type=number]').value = Math.round(v * 100) / 100;
        }
        olek.valem = asendaParameetrid(olek.toores);
        graafik.seaFunktsioon(olek.valem);
        uuendaUurijat();
        uuendaUrl();
        if (!animatsioon[p]) {
            clearTimeout(analuusiTaimer);
            analuusiTaimer = setTimeout(analuusi, 450);
        }
    }

    paramRead.addEventListener('input', e => {
        const rida = e.target.closest('.param');
        if (!rida) return;
        const v = parseFloat(String(e.target.value).replace(',', '.'));
        seaParameeter(rida.dataset.p, v, e.target.type === 'range' ? 'liugur' : 'arv');
    });

    paramRead.addEventListener('click', e => {
        const n = e.target.closest('.param-mangi');
        if (!n) return;
        const p = n.closest('.param').dataset.p;
        animatsioon[p] ? peataAnimatsioon(p) : kaivitaAnimatsioon(p);
    });

    // Parameeter "kõigub" -10 ja 10 vahel – graafik liigub nagu Desmosis
    function kaivitaAnimatsioon(p) {
        let suund = 1, eelmine = performance.now();
        const nupp = paramRead.querySelector(`[data-p="${p}"] .param-mangi`);
        nupp.innerHTML = IKOON_PAUS;
        nupp.classList.add('kaib');
        animatsioon[p] = setInterval(() => {
            const aeg = performance.now();
            let v = olek.param[p] + suund * Math.min(aeg - eelmine, 200) / 1000 * 4;   // 4 ühikut sekundis
            eelmine = aeg;
            if (v > 10) { v = 10; suund = -1; }
            if (v < -10) { v = -10; suund = 1; }
            seaParameeter(p, Math.round(v * 100) / 100);
        }, 33);
    }

    function peataAnimatsioon(p) {
        clearInterval(animatsioon[p]);
        delete animatsioon[p];
        const nupp = paramRead.querySelector(`[data-p="${p}"] .param-mangi`);
        if (nupp) { nupp.innerHTML = IKOON_MANGI; nupp.classList.remove('kaib'); }
        analuusi();
    }

    // ================= SISESTUS =================
    let analuusiTaimer = null;

    // paneel = true: uuenda ka parameetrite liugureid. Kirjutamise ajal seda ei tehta,
    // muidu "c" (enne "cos") või "s" (enne "sin") paistaks hetkeks parameetrina ja leht hüppaks.
    function loeSisestus(paneel = true) {
        olek.toores = Valem.latexValemiks(mf.value);
        if (paneel) uuendaParameetreid();
        olek.valem = asendaParameetrid(olek.toores);
    }

    function sisestusMuutus() {
        loeSisestus(false);
        vigaEl.hidden = true;
        if (olek.valem) {
            graafik.seaFunktsioon(olek.valem);
            uuendaUurijat();
        }
        clearTimeout(analuusiTaimer);
        analuusiTaimer = setTimeout(analuusi, 700);
    }

    mf.addEventListener('input', sisestusMuutus);
    mf.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); olek.keri = true; analuusi(true); }
    });
    document.getElementById('arvutaNupp').addEventListener('click', () => { olek.keri = true; analuusi(true); });

    document.querySelector('.naited').addEventListener('click', e => {
        const n = e.target.closest('.naide');
        if (!n) return;
        seaValem(n.dataset.valem);
        olek.keri = true;
        analuusi(true);
    });

    function seaValem(valem) {
        mf.value = Valem.tex(valem) ?? valem;
        loeSisestus();
        if (!olek.toores) { olek.toores = valem; olek.valem = asendaParameetrid(valem); }
        graafik.seaFunktsioon(olek.valem);
    }

    // ================= AJALUGU =================
    const ajaluguEl = document.getElementById('ajalugu');

    function lisaAjalukku(valem) {
        const loend = mali.loe('ajalugu', []).filter(v => v !== valem);
        loend.unshift(valem);
        mali.kirjuta('ajalugu', loend.slice(0, 8));
        naitaAjalugu();
    }

    function naitaAjalugu() {
        const loend = mali.loe('ajalugu', []);
        ajaluguEl.hidden = loend.length === 0;
        ajaluguEl.innerHTML = `<span class="naited-silt">${t('Недавние:', 'Hiljutised:')}</span>`
            + loend.map(v => `<button type="button" class="naide" data-valem="${Valem.esc(v)}">${Valem.ilus(v)}</button>`).join('')
            + `<button type="button" class="ajalugu-kustuta">${t('очистить', 'tühjenda')}</button>`;
    }

    ajaluguEl.addEventListener('click', e => {
        if (e.target.closest('.ajalugu-kustuta')) { mali.kirjuta('ajalugu', []); naitaAjalugu(); return; }
        const n = e.target.closest('.naide');
        if (n) { seaValem(n.dataset.valem); olek.keri = true; analuusi(true); }
    });
    naitaAjalugu();

    // ================= SERVER =================
    let paringuNr = 0;

    // kasutaja = true, kui arvutamise käivitas kasutaja ise (nupp, Enter, näide) – ainult siis lisame ajalukku.
    // kasutaja = 'algus' lehe avamisel. Automaatsel arvutamisel (kirjutamise ajal) vigu ei näidata – leht ei hüppa.
    async function analuusi(kasutaja) {
        clearTimeout(analuusiTaimer);
        loeSisestus();
        const naitaVigu = kasutaja === true || kasutaja === 'algus';
        if (!olek.valem) {
            olek.keri = false;
            if (naitaVigu) naitaViga(t('Введите функцию — например, x² − 4x + 3 — или выберите пример.', 'Sisesta funktsioon – näiteks x² − 4x + 3 – või vali näide.'));
            return;
        }
        const nr = ++paringuNr;
        tulemusEl.classList.add('laeb');
        try {
            const v = await fetch('/Home/Analuusi?' + new URLSearchParams({ valem: olek.valem }));
            const andmed = await v.json();
            if (nr !== paringuNr) return;
            if (andmed.viga) {
                olek.keri = false;   // vigase valemiga graafiku juurde ei keri
                if (naitaVigu) naitaViga(andmed.viga);
                else tulemusEl.classList.remove('laeb');
                return;
            }

            vigaEl.hidden = true;
            olek.analuus = andmed;
            selgitusEl.hidden = true;
            graafik.seaFunktsioon(andmed.valem);
            graafik.seaMargid(andmed.margid);
            naitaLegendi();
            // parameetri liigutamisel vaadet ei hüpata
            const vaateVoti = Object.keys(olek.param).length ? olek.toores : andmed.valem;
            if (olek.sobitatud !== vaateVoti) {
                olek.sobitatud = vaateVoti;
                graafik.sobitaVaade();
                // keele vahetuse järel taastame kasutaja suumi
                if (olek.taasta && olek.taasta.vaade) { graafik.vaade = olek.taasta.vaade; graafik.joonista(); }
                uuendaLiugurit();
            }
            uuendaUurijat();
            uuendaUrl();
            naitaTulemust();
            if (kasutaja === true) lisaAjalukku(olek.toores);
            if (olek.keri) { olek.keri = false; keriGraafikuni(); }
            if (olek.taasta) { olek.taasta = null; setTimeout(() => window.taastaKerimine && window.taastaKerimine(), 50); }
            if (valik(olek.leia).vajab) laePunktiLahendus();
        } catch {
            if (nr === paringuNr && naitaVigu) naitaViga(t('Нет связи с сервером. Попробуйте ещё раз.', 'Serveriga ei saanud ühendust. Proovi uuesti.'));
        } finally {
            if (nr === paringuNr) tulemusEl.classList.remove('laeb');
        }
    }

    function naitaViga(tekst) {
        vigaEl.textContent = tekst;
        vigaEl.hidden = false;
        tulemusEl.classList.remove('laeb');
        // viga on klaviatuuri all – kui see pole ekraanil, toome selle nähtavale
        const r = vigaEl.getBoundingClientRect();
        if (r.bottom > window.innerHeight || r.top < 0) vigaEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ================= TULEMUSED =================
    const peidetudVihje = () => t('нажмите, чтобы увидеть ответ', 'klõpsa, et näha vastust');

    // Iga rea lühitähis (nagu vihikus) – sõnad pole alati arusaadavad, tähis on
    const REA_TAHISED = {
        mp: { s: 'X', t: t('Область определения: все x, при которых f(x) можно вычислить', 'Määramispiirkond: kõik x, mille korral f(x) saab arvutada') },
        y: { s: 'f(0)', t: t('Пересечение с осью Oy: подставляем x = 0', 'Lõikepunkt y-teljega: paneme x = 0') },
        null: { s: 'X₀', t: t('Нули: x, при которых f(x) = 0', 'Nullkohad: x, mille korral f(x) = 0') },
        marg: { s: 'X⁺ X⁻', t: t('X⁺ — где f(x) > 0 (график выше оси Ox), X⁻ — где f(x) < 0', 'X⁺ – kus f(x) > 0 (graafik x-telje kohal), X⁻ – kus f(x) < 0') },
        t1: { s: "f'(x)", t: t('Первая производная', 'Esimene tuletis') },
        kp: { s: "f'(x)=0", t: t('Критические точки: где производная равна нулю', 'Kriitilised punktid: kus tuletis on null') },
        mon: { s: 'X↑︎ X↓︎', t: t('X↑ — функция возрастает, X↓ — функция убывает', 'X↑ – funktsioon kasvab, X↓ – funktsioon kahaneb') },
        ekst: { s: 'max min', t: t('Экстремумы: максимумы и минимумы', 'Ekstreemumid: maksimumid ja miinimumid') },
        t2: { s: "f''(x)", t: t('Вторая производная', 'Teine tuletis') },
        kum: { s: '∩ ∪', t: t('∩ — выпуклая (горка), ∪ — вогнутая (чаша)', '∩ – kumer (küür), ∪ – nõgus (kauss)') },
        kaanu: { s: 'K', t: t('Точки перегиба: где изгиб меняется ∩ ↔ ∪', 'Käänupunktid: kus kõverdus muutub ∩ ↔ ∪') }
    };

    // Vastuse real oleva tähise väike selgitus
    const TAHISE_SELGITUS = {
        'X⁺': 'f(x) > 0', 'X⁻': 'f(x) < 0',
        'X↑': t('возрастает', 'kasvab'), 'X↓': t('убывает', 'kahaneb'),
        '∩': t('выпуклая', 'kumer'), '∪': t('вогнутая', 'nõgus')
    };

    function vastusHtml(rida) {
        let sisu;
        if (rida.onValem) {
            sisu = Valem.ilus(rida.vastus);
        } else {
            // "X⁺: …\nX⁻: …" -> iga osa omal real, tähis ees
            let osad = rida.vastus.split('\n');
            if (rida.voti === 'ekst') osad = rida.vastus.split(/,\s(?=(?:max|min) =)/);
            sisu = osad.length > 1 || /^[^:]{1,3}: /.test(osad[0])
                ? osad.map(osa => {
                    const m = osa.match(/^([^:]{1,3}): (.*)$/);
                    if (!m) return `<span class="vastus-rida">${Valem.esc(Valem.ilusTekst(osa))}</span>`;
                    const tahis = m[1].replace('︎', '');
                    const selgitus = TAHISE_SELGITUS[tahis];
                    return `<span class="vastus-rida"><span class="tahis">${Valem.esc(tahis.replace(/([↑↓])/, '$1︎'))}</span>${Valem.esc(Valem.ilusTekst(m[2]))}${selgitus ? `<small>${Valem.esc(selgitus)}</small>` : ''}</span>`;
                }).join('')
                : Valem.esc(Valem.ilusTekst(rida.vastus));
        }
        return `<span class="vastus-peidus" title="${peidetudVihje()}">${sisu}</span>`;
    }

    function reaNimiHtml(r) {
        const tahis = REA_TAHISED[r.voti];
        return (tahis ? `<span class="rea-tahis" title="${Valem.esc(tahis.t)}">${Valem.esc(tahis.s)}</span>` : '') + `<span class="rea-nimi">${Valem.esc(r.nimi)}</span>`;
    }

    // ---------- Lihtsad selgitused iga sammu juurde ----------
    // lihtne: üks lause tavakeeles; kust: miks nii tehakse (avaneb "Kust see tuleb?" all)
    const SELGITUSED = {
        mp: {
            lihtne: t('Смотрим, какие x можно подставить в формулу, а какие нельзя.', 'Vaatame, milliseid x-e tohib valemisse panna ja milliseid mitte.'),
            kust: t('Делить на ноль нельзя, квадратный корень из отрицательного числа не извлекается, логарифм есть только у положительных чисел. Каждое такое место в формуле даёт условие на x. Если таких мест нет (многочлен), подходят все x.',
                    'Nulliga jagada ei saa, negatiivsest arvust ruutjuurt ei võeta ja logaritm on ainult positiivsel arvul. Iga selline koht valemis annab x-ile tingimuse. Kui selliseid kohti pole (polünoom), sobivad kõik x-id.')
        },
        y: {
            lihtne: t('Подставляем x = 0 — так находим, где график пересекает вертикальную ось.', 'Paneme x = 0 – nii leiame, kus graafik lõikab püstist telge.'),
            kust: t('У всех точек оси Oy координата x = 0. Значит, точка графика на этой оси — (0; f(0)).', 'Kõigil y-telje punktidel on x = 0. Seega graafiku punkt sellel teljel on (0; f(0)).')
        },
        null: {
            lihtne: t('Ищем x, при которых значение функции равно нулю.', 'Otsime x-e, mille korral funktsiooni väärtus on null.'),
            kust: t('Если f(x) = 0, то точка (x; 0) лежит на оси Ox — там график её пересекает или касается. Поэтому нули — это корни уравнения f(x) = 0.',
                    'Kui f(x) = 0, asub punkt (x; 0) x-teljel – seal graafik lõikab või puudutab telge. Seega nullkohad on võrrandi f(x) = 0 lahendid.')
        },
        marg: {
            lihtne: t('Смотрим, где график выше оси Ox (плюс), а где ниже (минус).', 'Vaatame, kus graafik on x-telje kohal (pluss) ja kus all (miinus).'),
            kust: t('Функция может сменить знак только в нуле или там, где она не определена. Между соседними нулями знак не меняется — поэтому достаточно проверить одну точку в каждом промежутке.',
                    'Funktsioon saab märki muuta ainult nullkohas või seal, kus ta pole määratud. Naabernullkohtade vahel märk ei muutu – seepärast piisab ühest punktist igas vahemikus.')
        },
        t1: {
            lihtne: t('Находим производную — она показывает, как быстро растёт или падает функция.', 'Leiame tuletise – see näitab, kui kiiresti funktsioon kasvab või kahaneb.'),
            kust: t('Производная в точке — это наклон касательной: k = f\'(x). Её считают по таблице производных и правилам: сумма, число перед функцией, произведение, частное, сложная функция.',
                    'Tuletis punktis on puutuja tõus: k = f\'(x). See arvutatakse tuletiste tabeli ja reeglite järgi: summa, konstant ees, korrutis, jagatis, liitfunktsioon.')
        },
        kp: {
            lihtne: t('Ищем точки, где производная равна нулю — там график на мгновение «останавливается».', 'Otsime punkte, kus tuletis on null – seal graafik hetkeks „peatub“.'),
            kust: t('В вершине или во впадине касательная горизонтальна, то есть её наклон f\'(x) = 0. Поэтому максимумы и минимумы ищут среди корней уравнения f\'(x) = 0.',
                    'Tipus või orus on puutuja horisontaalne, st tema tõus f\'(x) = 0. Seepärast otsitakse maksimume ja miinimume võrrandi f\'(x) = 0 lahendite hulgast.')
        },
        mon: {
            lihtne: t('По знаку производной узнаём, где функция растёт, а где падает.', 'Tuletise märgi järgi näeme, kus funktsioon kasvab ja kus kahaneb.'),
            kust: t('f\'(x) — наклон касательной. Наклон больше нуля — график идёт вверх (возрастает), меньше нуля — вниз (убывает). Знак f\' может смениться только в критических точках.',
                    'f\'(x) on puutuja tõus. Kui tõus on positiivne, läheb graafik üles (kasvab), kui negatiivne – alla (kahaneb). f\' märk saab muutuda ainult kriitilistes punktides.')
        },
        ekst: {
            lihtne: t('В каждой критической точке смотрим, меняется ли знак производной.', 'Igas kriitilises punktis vaatame, kas tuletise märk muutub.'),
            kust: t('Если до точки функция росла (f\' > 0), а после падает (f\' < 0) — это вершина, максимум. Наоборот (− → +) — впадина, минимум. Если знак не меняется — экстремума нет. Значение y находим, подставляя x в исходную функцию f(x).',
                    'Kui enne punkti funktsioon kasvas (f\' > 0) ja pärast kahaneb (f\' < 0), on see tipp ehk maksimum. Vastupidi (− → +) – org ehk miinimum. Kui märk ei muutu, ekstreemumit pole. y leiame, kui paneme x-i algsesse funktsiooni f(x).')
        },
        t2: {
            lihtne: t('Берём производную ещё раз — от первой производной.', 'Võtame tuletise veel kord – esimesest tuletisest.'),
            kust: t('Вторая производная показывает, как меняется наклон: растёт он или уменьшается. От этого зависит, в какую сторону изогнут график.',
                    'Teine tuletis näitab, kuidas tõus muutub: kas suureneb või väheneb. Sellest sõltub, kummale poole graafik kõverdub.')
        },
        t2n: {
            lihtne: t('Ищем, где вторая производная равна нулю — там изгиб может смениться.', 'Otsime, kus teine tuletis on null – seal võib kõverdus muutuda.'),
            kust: t('Изгиб меняется только там, где f\'\'(x) переходит через ноль. Поэтому сначала решаем уравнение f\'\'(x) = 0.',
                    'Kõverdus saab muutuda ainult seal, kus f\'\'(x) läheb läbi nulli. Seepärast lahendame kõigepealt võrrandi f\'\'(x) = 0.')
        },
        kum: {
            lihtne: t('По знаку второй производной узнаём, куда изогнут график.', 'Teise tuletise märgi järgi näeme, kuhu graafik kõverdub.'),
            kust: t('f\'\'(x) > 0: наклон растёт, график изогнут как чаша ∪ (вогнутый). f\'\'(x) < 0: наклон уменьшается, график как горка ∩ (выпуклый).',
                    'f\'\'(x) > 0: tõus suureneb, graafik on nagu kauss ∪ (nõgus). f\'\'(x) < 0: tõus väheneb, graafik on nagu küür ∩ (kumer).')
        },
        kaanu: {
            lihtne: t('Точка перегиба — где изгиб меняется с ∩ на ∪ или наоборот.', 'Käänupunkt on koht, kus kõverdus muutub ∩ → ∪ või vastupidi.'),
            kust: t('В такой точке f\'\'(x) = 0 и знак f\'\' меняется. Если f\'\' = 0, но знак не меняется (как у x⁴ в нуле), перегиба нет.',
                    'Sellises punktis f\'\'(x) = 0 ja f\'\' märk muutub. Kui f\'\' = 0, aga märk ei muutu (nagu x⁴ nullis), käänupunkti pole.')
        },
        puut: {
            lihtne: t('Касательная — прямая, которая касается графика в одной точке и идёт с тем же наклоном.', 'Puutuja on sirge, mis puudutab graafikut ühes punktis ja sama tõusuga.'),
            kust: t('Наклон касательной в точке x₀ равен f\'(x₀). Прямая через точку (x₀; y₀) с наклоном k: y − y₀ = k(x − x₀). Нормаль перпендикулярна касательной, а у перпендикулярных прямых k₁·k₂ = −1, поэтому k_n = −1/k.',
                    'Puutuja tõus punktis x₀ on f\'(x₀). Sirge läbi punkti (x₀; y₀) tõusuga k: y − y₀ = k(x − x₀). Normaal on puutujaga risti ja ristuvatel sirgetel k₁·k₂ = −1, seega k_n = −1/k.')
        },
        vaart: {
            lihtne: t('Подставляем число вместо x и считаем.', 'Paneme x-i asemele arvu ja arvutame.'),
            kust: t('f(a) — значение функции при x = a. Отрицательные числа подставляем в скобках: (−2)² = 4, а −2² = −4.',
                    'f(a) on funktsiooni väärtus, kui x = a. Negatiivse arvu paneme sulgudesse: (−2)² = 4, aga −2² = −4.')
        }
    };
    SELGITUSED.mono = SELGITUSED.mon;

    // Võtted, mida lahenduskäigus kasutatakse – kui rida neid mainib, lisame selgituse
    const VOTTED = [
        { re: /Дискриминант|Diskriminant/, nimi: t('Дискриминант', 'Diskriminant'),
          tekst: t('D = b² − 4ac показывает, сколько корней у квадратного уравнения: D > 0 — два, D = 0 — один, D < 0 — ни одного. Формула x = (−b ± √D) / (2a) получается выделением полного квадрата.',
                   'D = b² − 4ac näitab, mitu lahendit on ruutvõrrandil: D > 0 – kaks, D = 0 – üks, D < 0 – mitte ühtegi. Valem x = (−b ± √D) / (2a) tuleb täisruudu eraldamisest.') },
        { re: /Горнер|Horner/, nimi: t('Схема Горнера', 'Horneri skeem'),
          tekst: t('Быстрый способ разделить многочлен на (x − r). Пишем коэффициенты в строку, первый сносим вниз, дальше каждый раз умножаем на r и прибавляем следующий коэффициент. Последнее число — остаток, он должен быть 0.',
                   'Kiire viis jagada polünoom teguriga (x − r). Kirjutame kordajad ritta, esimese toome alla, edasi iga kord korrutame r-iga ja liidame järgmise kordaja. Viimane arv on jääk – see peab olema 0.') },
        { re: /Биквадрат|Bikvadraat/, nimi: t('Замена t = x²', 'Asendus t = x²'),
          tekst: t('В уравнении есть только x⁴ и x², поэтому замена t = x² превращает его в обычное квадратное. После решения возвращаемся: x = ±√t (только если t ≥ 0).',
                   'Võrrandis on ainult x⁴ ja x², seega asendus t = x² teeb sellest tavalise ruutvõrrandi. Pärast lahendamist läheme tagasi: x = ±√t (ainult kui t ≥ 0).') },
        { re: /за скобки|sulgude ette/, nimi: t('Вынесение за скобки', 'Sulgude ette toomine'),
          tekst: t('Если в каждом слагаемом есть общий множитель, его выносят. Произведение равно нулю, когда хотя бы один множитель равен нулю — так уравнение распадается на простые части.',
                   'Kui igas liikmes on ühine tegur, tuuakse see sulgude ette. Korrutis on null, kui vähemalt üks tegur on null – nii jaguneb võrrand lihtsamateks osadeks.') },
        { re: /пробная точка|proovipunkt/, nimi: t('Пробная точка', 'Proovipunkt'),
          tekst: t('Почему хватает одной точки? Непрерывная функция не может сменить знак, не пройдя через ноль. Внутри промежутка нулей нет, значит знак там везде такой же, как в пробной точке.',
                   'Miks piisab ühest punktist? Pidev funktsioon ei saa märki muuta, ilma et läbiks nulli. Vahemiku sees nullkohti pole, seega on märk seal kõikjal sama mis proovipunktis.') },
        { re: /производная произведения|korrutise tuletis/, nimi: t('Производная произведения', 'Korrutise tuletis'),
          tekst: t('(u·v)\' = u\'·v + u·v\' — каждый множитель по очереди дифференцируем, а другой оставляем как есть.',
                   '(u·v)\' = u\'·v + u·v\' – kumbagi tegurit tuletame kordamööda, teine jääb samaks.') },
        { re: /производная частного|jagatise tuletis/, nimi: t('Производная частного', 'Jagatise tuletis'),
          tekst: t('(u/v)\' = (u\'·v − u·v\') / v²: производная числителя на знаменатель минус числитель на производную знаменателя, всё делим на квадрат знаменателя.',
                   '(u/v)\' = (u\'·v − u·v\') / v²: lugeja tuletis korda nimetaja miinus lugeja korda nimetaja tuletis, kõik jagatud nimetaja ruuduga.') },
        { re: /деления пополам|poolitus/, nimi: t('Метод деления пополам', 'Poolitusmeetod'),
          tekst: t('Если на концах отрезка знаки разные, корень внутри. Делим отрезок пополам и оставляем ту половину, где знак меняется, — и так много раз, пока не получим точный ответ.',
                   'Kui lõigu otstes on märgid erinevad, on lahend sees. Poolitame lõigu ja jätame alles poole, kus märk muutub – ja nii mitu korda, kuni vastus on täpne.') },
        { re: /p\/q/, nimi: t('Рациональный корень', 'Ratsionaalne lahend'),
          tekst: t('Если у многочлена целые коэффициенты, его рациональный корень p/q обязательно такой: p делит свободный член, q делит старший коэффициент. Поэтому проверяем только этих кандидатов.',
                   'Kui polünoomil on täisarvulised kordajad, siis tema ratsionaalne lahend p/q on alati selline: p jagab vabaliiget, q jagab juhtkordajat. Seepärast kontrollime ainult neid kandidaate.') },
        { re: /делителей свободного члена|vabaliikme/, nimi: t('Целый корень', 'Täisarvuline lahend'),
          tekst: t('Подставляем делители свободного члена: если x = r — корень, то r·(…) = свободный член, значит r обязательно его делит.',
                   'Proovime vabaliikme jagajaid: kui x = r on lahend, siis r·(…) = vabaliige, seega r peab seda jagama.') },
        { re: /Дробь равна нулю|Murd võrdub/, nimi: t('Когда дробь равна нулю', 'Millal murd on null'),
          tekst: t('Дробь равна нулю только тогда, когда числитель равен нулю, а знаменатель — нет (на ноль делить нельзя).',
                   'Murd on null ainult siis, kui lugeja on null ja nimetaja ei ole (nulliga jagada ei saa).') },
        { re: /Выносим множитель|Toome teguri/, nimi: t('Почему eˣ отбрасываем', 'Miks eˣ ära jätame'),
          tekst: t('eˣ всегда больше нуля, поэтому этот множитель никогда не даёт корней — остаётся решить то, что в скобках.',
                   'eˣ on alati suurem kui null, seega see tegur lahendeid ei anna – jääb lahendada see, mis on sulgudes.') },
        { re: /k_n/, nimi: t('Перпендикулярные прямые', 'Ristuvad sirged'),
          tekst: t('У перпендикулярных прямых произведение наклонов равно −1: k·k_n = −1, отсюда k_n = −1/k.',
                   'Ristuvate sirgete tõusude korrutis on −1: k·k_n = −1, seega k_n = −1/k.') },
        { re: /\(xⁿ\)'/, nimi: t('Производная степени', 'Astme tuletis'),
          tekst: t('(xⁿ)\' = n·xⁿ⁻¹: показатель степени выносим вперёд, а саму степень уменьшаем на 1. Например, (x³)\' = 3x².',
                   '(xⁿ)\' = n·xⁿ⁻¹: astendaja tuleb ette ja aste väheneb ühe võrra. Näiteks (x³)\' = 3x².') }
    ];

    // "Kust see tuleb?" lõigud – kasutatakse nii lehel (kokkuvolditult) kui ka PDF-is (avatult)
    function kustLoigud(samm) {
        const s = SELGITUSED[samm.voti];
        const tekst = samm.read.join(' ');
        const votted = VOTTED.filter(v => v.re.test(tekst));
        return (s ? `<p>${Valem.esc(s.kust)}</p>` : '')
            + votted.map(v => `<p><b>${Valem.esc(v.nimi)}.</b> ${Valem.esc(v.tekst)}</p>`).join('');
    }

    function kustHtml(samm) {
        const sisu = kustLoigud(samm);
        if (!sisu) return '';
        return `<details class="kust"><summary>${t('Откуда это?', 'Kust see tuleb?')}</summary><div class="kust-sisu">${sisu}</div></details>`;
    }

    function sammudHtml(sammud, haaval = olek.haaval) {
        if (!sammud.length) return `<p class="vihje">${t('Для этого пункта нет отдельного решения.', 'Selle jaoks pole eraldi lahenduskäiku.')}</p>`;
        const html = '<ol class="sammud">' + sammud.map((s, i) => `
            <li class="${haaval && i > 0 ? 'peidus-samm' : ''}">
                <div class="samm-nimi">${Valem.esc(s.pealkiri)}</div>
                ${SELGITUSED[s.voti] ? `<p class="lihtne">${Valem.esc(SELGITUSED[s.voti].lihtne)}</p>` : ''}
                ${s.read.map(r => `<div class="rida">${Valem.renderRida(r)}</div>`).join('')}
                ${kustHtml(s)}
            </li>`).join('') + '</ol>';
        return haaval && sammud.length > 1
            ? html + `<button type="button" class="nupp-vaike jargmine-samm">${jargmineTekst(1, sammud.length)}</button>`
            : html;
    }

    const jargmineTekst = (n, kokku) => t(`Следующий шаг (${n} из ${kokku})`, `Järgmine samm (${n} / ${kokku})`);

    function naitaTulemust() {
        const v = valik(olek.leia);
        pealkiriEl.textContent = v.voti === 'koik' ? t('Результаты', 'Tulemused') : v.nimi;
        const a = olek.analuus;
        if (!a) {
            tulemusEl.innerHTML = `<p class="tuhi">${t('Введите функцию и нажмите <b>Посчитать</b>.', 'Sisesta funktsioon ja vajuta <b>Arvuta</b>.')}</p>`;
            return;
        }

        const pea = `<div class="valem-pea">f(x) = ${Valem.ilus(a.valem)}</div>`;
        const vastuseSilt = t('Ответ', 'Vastus') + (olek.ise ? `<span class="peidetud-silt">(${peidetudVihje()})</span>` : '');
        const juhendiLink = `<a class="juhendilink" href="/Home/Juhend#${v.voti}">${t('Все случаи и примеры — в справочнике →', 'Kõik juhtumid ja näited – juhendis →')}</a>`;

        if (v.voti === 'koik') {
            tulemusEl.innerHTML = pea + `
                <p class="selgitus">${Valem.esc(v.selgitus)}</p>
                <div class="tabelikast"><table class="kokkuvote">
                    <tbody>${a.read.map(r => `
                        <tr class="rida-pea${olek.lahti.has(r.voti) ? ' avatud' : ''}" data-voti="${r.voti}" tabindex="0" aria-expanded="${olek.lahti.has(r.voti)}">
                            <th>${reaNimiHtml(r)}</th>
                            <td class="vastus">${vastusHtml(r)}</td>
                            <td class="kuidas"><span>${t('Как?', 'Kuidas?')}</span> <span class="nool">▾</span></td>
                        </tr>
                        <tr class="rida-sisu" ${olek.lahti.has(r.voti) ? '' : 'hidden'}>
                            <td colspan="3">${sammudHtml(r.sammud)}
                                <button type="button" class="nupp-vaike" data-eraldi="${r.voti}">${t('Открыть отдельно →', 'Ava eraldi vaates →')}</button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table></div>
                <div class="tegevused">
                    <button type="button" class="nupp-vaike" id="avaKoik">${t('Раскрыть все решения', 'Ava kõik lahendused')}</button>
                    <button type="button" class="nupp-vaike" id="salvesta">${t('Сохранить в мои функции', 'Salvesta minu funktsioonidesse')}</button>
                </div>`;
            return;
        }

        if (v.vajab) {
            tulemusEl.innerHTML = pea + `<p class="selgitus">${Valem.esc(v.selgitus)}</p><div id="punktiTulemus"><p class="vihje">${t('Считаю…', 'Arvutan…')}</p></div>`;
            return;
        }

        const r = a.read.find(x => x.voti === v.voti);
        tulemusEl.innerHTML = pea + `
            <p class="selgitus"><b>${t('Что это?', 'Mis see on?')}</b> ${Valem.esc(v.selgitus)}</p>
            <div class="vastuskast"><span class="vastuskast-silt">${vastuseSilt}</span><div>${vastusHtml(r)}</div></div>
            <h3 class="kuidas-pealkiri">${t('Как это найти — по шагам', 'Kuidas seda leida? — sammhaaval')}</h3>
            ${sammudHtml(r.sammud)}
            ${juhendiLink}`;
    }

    tulemusEl.addEventListener('click', e => {
        // "Proovi ise": esimene klõps peidetud vastusel avab selle
        const peidus = e.target.closest('.vastus-peidus');
        if (olek.ise && peidus && !peidus.classList.contains('avatud-vastus')) {
            peidus.classList.add('avatud-vastus');
            e.stopPropagation();
            return;
        }
        const jargmine = e.target.closest('.jargmine-samm');
        if (jargmine) {
            const ol = jargmine.previousElementSibling;
            const peidetud = ol.querySelectorAll('li.peidus-samm');
            if (peidetud.length) peidetud[0].classList.remove('peidus-samm');
            const kokku = ol.children.length, naha = kokku - peidetud.length + 1;
            if (naha >= kokku) jargmine.remove();
            else jargmine.textContent = jargmineTekst(naha, kokku);
            return;
        }
        const eraldi = e.target.closest('[data-eraldi]');
        if (eraldi) { valiLeia(eraldi.dataset.eraldi, true); return; }
        if (e.target.closest('#salvesta')) {
            document.getElementById('salvestaValem').value = olek.analuus.valem;
            document.getElementById('salvestaVorm').submit();
            return;
        }
        if (e.target.closest('#avaKoik')) {
            const koikLahti = olek.analuus.read.every(r => olek.lahti.has(r.voti));
            olek.analuus.read.forEach(r => koikLahti ? olek.lahti.delete(r.voti) : olek.lahti.add(r.voti));
            naitaTulemust();
            return;
        }
        const rida = e.target.closest('.rida-pea');
        if (rida) lulitaRida(rida);
    });
    tulemusEl.addEventListener('keydown', e => {
        const rida = e.target.closest('.rida-pea');
        if (rida && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); lulitaRida(rida); }
    });

    function lulitaRida(rida) {
        const voti = rida.dataset.voti;
        const lahti = !olek.lahti.has(voti);
        lahti ? olek.lahti.add(voti) : olek.lahti.delete(voti);
        rida.classList.toggle('avatud', lahti);
        rida.setAttribute('aria-expanded', lahti);
        rida.nextElementSibling.hidden = !lahti;
        // graafikul näitame selle rea punkte
        const v = valik(voti);
        graafik.esile = lahti ? v.esile : valik('koik').esile;
        graafik.varv = lahti ? (v.varv || null) : null;
        naitaLegendi();
        graafik.joonista();
    }

    // ================= TÖÖRIISTARIBA =================
    const iseNupp = document.getElementById('iseNupp');
    const sammNupp = document.getElementById('sammNupp');

    function uuendaLulitid() {
        juur.classList.toggle('ise', olek.ise);
        iseNupp.setAttribute('aria-pressed', olek.ise);
        sammNupp.setAttribute('aria-pressed', olek.haaval);
    }

    iseNupp.addEventListener('click', () => {
        olek.ise = !olek.ise;
        mali.kirjuta('ise', olek.ise);
        uuendaLulitid();
        naitaTulemust();
        if (valik(olek.leia).vajab) laePunktiLahendus();
    });
    sammNupp.addEventListener('click', () => {
        olek.haaval = !olek.haaval;
        mali.kirjuta('haaval', olek.haaval);
        uuendaLulitid();
        naitaTulemust();
        if (valik(olek.leia).vajab) laePunktiLahendus();
    });
    uuendaLulitid();

    // ================= PDF (brauseri "Salvesta PDF-ina") =================
    // Eraldi A4-leht: lühike = vastuste tabel + graafik; põhjalik = lisaks kogu lahenduskäik koos selgitustega.

    // Graafik pildina: joonistame selle eraldi (nähtamatu) lõuendile, et kasutaja suum ja x₀ ei segaks
    function graafikuPilt() {
        const kast = document.createElement('div');
        kast.style.cssText = 'position:fixed;left:-20000px;top:0;width:1100px;height:600px;';
        const louend = document.createElement('canvas');
        louend.style.cssText = 'width:1100px;height:600px;display:block;';
        [['--g-vork', '#f3e3e9'], ['--g-telg', '#3b1a28'], ['--g-tekst', '#6b4553'], ['--g-f', '#e11d48'],
         ['--g-d1', '#7c3aed'], ['--g-d2', '#0891b2'], ['--g-taust', '#ffffff']].forEach(([k, v]) => louend.style.setProperty(k, v));
        kast.appendChild(louend);
        document.body.appendChild(kast);
        const g = new Graafik(louend, { interaktiivne: false });
        g.esile = ['null', 'y', 'max', 'min', 'kaanu'];
        g.naita.margid = true;
        g.naita.sildid = true;
        g.f = graafik.f; g.d1 = graafik.d1; g.d2 = graafik.d2;   // sama (parameetritega) funktsioon
        g.seaMargid(olek.analuus.margid);
        g.sobitaVaade();
        g._joonista();                                             // kohe, mitte järgmisel kaadril
        const pilt = louend.toDataURL('image/png');
        kast.remove();
        return pilt;
    }

    function aruanneHtml(tais) {
        const a = olek.analuus;
        const kuupaev = new Date().toLocaleDateString(window.KEEL === 'ru' ? 'ru-RU' : 'et-EE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const parameetrid = leiaParameetrid(olek.toores).map(p => `${p} = ${String(olek.param[p] ?? 1).replace('-', '−')}`).join(', ');
        const tuubid = [...new Set(a.margid.map(m => m.tuup))].filter(tp => ['null', 'y', 'max', 'min', 'kaanu'].includes(tp));
        const legend = `<span class="leg"><i style="background:#e11d48"></i>f(x)</span>`
            + tuubid.map(tp => `<span class="leg"><i class="ring" style="border-color:${Graafik.MARGID[tp].varv}"></i>${Valem.esc(Graafik.MARGID[tp].nimi)}</span>`).join('');

        let html = `
            <header class="ar-pea">
                <div class="ar-logo">f(x)</div>
                <div>
                    <h1>${tais ? t('Исследование функции — полное решение', 'Funktsiooni uurimine – täielik lahendus') : t('Исследование функции — кратко', 'Funktsiooni uurimine – lühidalt')}</h1>
                    <div class="ar-kuupaev">${kuupaev} · ${t('Исследование функций', 'Funktsioonide uurija')}</div>
                </div>
            </header>
            <div class="ar-valem">f(x) = ${Valem.ilus(a.valem)}${parameetrid ? `<div class="ar-param">${t('Параметры', 'Parameetrid')}: ${Valem.esc(parameetrid)}</div>` : ''}</div>

            <h2>1. ${t('Итоги', 'Kokkuvõte')}</h2>
            <table class="ar-tabel"><tbody>
                ${a.read.map(r => `<tr><th>${reaNimiHtml(r)}</th><td>${vastusHtml(r)}</td></tr>`).join('')}
            </tbody></table>

            <section class="ar-graafik">
                <h2>2. ${t('График', 'Graafik')}</h2>
                <img src="${graafikuPilt()}" alt="${t('График функции', 'Funktsiooni graafik')}" />
                <div class="ar-legend">${legend}</div>
            </section>`;

        if (tais) {
            // kogu lahenduskäik serveri järjekorras (lõpus olev "Vastus" on juba kokkuvõttes)
            const sammud = a.sammud.filter(s => s.voti !== 'vastus');
            html += `
                <h2 class="ar-uus-lk">3. ${t('Решение по шагам', 'Lahenduskäik sammhaaval')}</h2>
                <ol class="ar-sammud">
                    ${sammud.map(s => {
                        const lihtne = SELGITUSED[s.voti]?.lihtne;
                        const miks = kustLoigud(s);
                        return `<li>
                            <h3>${Valem.esc(s.pealkiri)}</h3>
                            ${lihtne ? `<p class="lihtne">${Valem.esc(lihtne)}</p>` : ''}
                            ${s.read.map(r => `<div class="rida">${Valem.renderRida(r)}</div>`).join('')}
                            ${miks ? `<div class="ar-miks"><b>${t('Почему так', 'Miks nii')}:</b>${miks}</div>` : ''}
                        </li>`;
                    }).join('')}
                </ol>`;
        }

        html += `<footer class="ar-jalus">${t('Создано в приложении «Исследование функций»', 'Koostatud rakendusega „Funktsioonide uurija“')} · ${kuupaev}</footer>`;
        return html;
    }

    function salvestaPdf(tais) {
        if (!olek.analuus) return;
        document.getElementById('prindiLeht')?.remove();
        const leht = document.createElement('div');
        leht.id = 'prindiLeht';
        leht.className = 'aruanne';
        leht.innerHTML = aruanneHtml(tais);
        document.body.appendChild(leht);
        document.body.classList.add('prindin');

        // PDF-faili nimi tuleb lehe pealkirjast
        const vanaPealkiri = document.title;
        document.title = `${tais ? t('Исследование функции', 'Funktsiooni uurimine') : t('Кратко', 'Lühidalt')} f(x) = ${a11yValem(olek.analuus.valem)}`;
        const lopp = () => {
            document.body.classList.remove('prindin');
            leht.remove();
            document.title = vanaPealkiri;
            window.removeEventListener('afterprint', lopp);
        };
        window.addEventListener('afterprint', lopp);
        const pilt = leht.querySelector('img');
        (pilt.complete ? Promise.resolve() : new Promise(r => { pilt.onload = r; pilt.onerror = r; }))
            .then(() => setTimeout(() => window.print(), 60));
    }

    // failinimes pole * ega ^ ilusad
    const a11yValem = (v) => v.replace(/\*/g, '·').replace(/\^2/g, '²').replace(/\^3/g, '³');

    document.getElementById('pdfLuhike').addEventListener('click', () => salvestaPdf(false));
    document.getElementById('pdfTais').addEventListener('click', () => salvestaPdf(true));

    // Pärast näite valimist viime kasutaja otse joonistatud graafiku juurde (telefonis on graafik tulemuste all)
    function keriGraafikuni() {
        const siht = window.innerWidth < 992 ? document.getElementById('graafikukaart') : document.getElementById('tulemused');
        // väike viivitus, et uus tulemus oleks enne kerimist paigas
        const sujuv = document.visibilityState === 'visible' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(() => siht.scrollIntoView({ behavior: sujuv ? 'smooth' : 'auto', block: 'start' }), 60);
    }

    function laadiPng() {
        const c = document.getElementById('graafik');
        const valge = document.createElement('canvas');
        valge.width = c.width;
        valge.height = c.height;
        const ctx = valge.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, valge.width, valge.height);
        ctx.drawImage(c, 0, 0);
        valge.toBlob(b => {
            const url = URL.createObjectURL(b);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'graafik.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
    }

    // ================= PUUTUJA / VÄÄRTUS (vajavad punkti) =================
    let punktiTaimer = null, punktiNr = 0;

    function laePunktiLahendus() {
        clearTimeout(punktiTaimer);
        punktiTaimer = setTimeout(async () => {
            const kast = document.getElementById('punktiTulemus');
            if (!kast || !olek.analuus) return;
            const v = valik(olek.leia);
            const nr = ++punktiNr;
            const url = v.voti === 'puut'
                ? '/Home/Puutuja?' + new URLSearchParams({ valem: olek.analuus.valem, x0: olek.x0 })
                : '/Home/Vaartus?' + new URLSearchParams({ valem: olek.analuus.valem, a: olek.x0 });
            try {
                const tul = await (await fetch(url)).json();
                if (nr !== punktiNr) return;
                if (!tul.korras) {
                    kast.innerHTML = `<div class="vastuskast viga-kast"><span class="vastuskast-silt">${t('Нельзя вычислить', 'Ei saa arvutada')}</span><div>${Valem.esc(tul.viga)}</div></div>`
                        + (tul.read && tul.read.length ? sammudHtml([{ pealkiri: t('Пояснение', 'Selgitus'), read: tul.read, voti: v.voti }]) : '');
                    return;
                }
                const sisu = v.voti === 'puut'
                    ? `<div class="sirge"><span class="silt puutuja">${t('Касательная', 'Puutuja')}</span>${Valem.esc(Valem.ilusTekst(tul.puutuja))}</div>
                       <div class="sirge"><span class="silt normaal">${t('Нормаль', 'Normaal')}</span>${Valem.esc(Valem.ilusTekst(tul.normaal))}</div>`
                    : Valem.esc(Valem.ilusTekst(tul.vastus));
                const silt = t('Ответ', 'Vastus') + (olek.ise ? `<span class="peidetud-silt">(${peidetudVihje()})</span>` : '');
                kast.innerHTML = `
                    <div class="vastuskast"><span class="vastuskast-silt">${silt}</span><div><span class="vastus-peidus" title="${peidetudVihje()}">${sisu}</span></div></div>
                    <h3 class="kuidas-pealkiri">${t('Как это найти — по шагам', 'Kuidas seda leida? — sammhaaval')}</h3>
                    ${sammudHtml([{ pealkiri: v.voti === 'puut' ? t('Касательная и нормаль', 'Puutuja ja normaal') : t('Вычисление значения', 'Väärtuse arvutamine'), read: tul.read, voti: v.voti }])}
                    <a class="juhendilink" href="/Home/Juhend#${v.voti}">${t('Все случаи и примеры — в справочнике →', 'Kõik juhtumid ja näited – juhendis →')}</a>`;
            } catch {
                kast.innerHTML = `<p class="viga">${t('При вычислении произошла ошибка.', 'Arvutamisel tekkis viga.')}</p>`;
            }
        }, 250);
    }

    // ================= GRAAFIK: punkt, liugur, lülitid =================
    function seaPunkt(x, allikas) {
        if (!Number.isFinite(x)) return;
        olek.x0 = x;
        graafik.punkt = x;
        if (allikas !== 'vali') x0Vali.value = +x.toFixed(4);
        if (allikas !== 'liugur') {
            if (x < +liugur.min || x > +liugur.max) uuendaLiugurit();
            liugur.value = x;
        }
        graafik.joonista();
        uuendaUurijat();
        if (valik(olek.leia).vajab) laePunktiLahendus();
    }

    graafik.onPunkt = (x) => seaPunkt(x, 'graafik');

    // ================= KLÕPS ERILISEL PUNKTIL: kuidas see leiti =================
    const selgitusEl = document.getElementById('margiSelgitus');
    const MARGI_RIDA = { null: 'null', y: 'y', max: 'ekst', min: 'ekst', kp: 'kp', kaanu: 'kaanu' };

    function margiSisu(m) {
        const f = graafik.f, d1 = graafik.d1, d2 = graafik.d2;
        const x = m.x, xs = arv(x, 3);
        // naaberpunktid märgi kontrolliks – mitte kaugemale kui pool vahemaad järgmise erilise punktini
        const naabrid = olek.analuus.margid.filter(o => o !== m && Math.abs(o.x - x) > 1e-9).map(o => Math.abs(o.x - x));
        const h = Math.min(0.1, ...naabrid.map(d => d / 2));
        const vasak = arv(x - h, 3), parem = arv(x + h, 3);
        const mark = (v) => v > 1e-9 ? '> 0' : v < -1e-9 ? '< 0' : '= 0';
        const rida = (html) => `<div class="margi-rida">${html}</div>`;
        const jareldus = (html) => `<div class="margi-jareldus">${html}</div>`;

        switch (m.tuup) {
            case 'null':
                return rida(t('Здесь график пересекает ось Ox, потому что значение функции равно нулю.', 'Siin lõikab graafik x-telge, sest funktsiooni väärtus on null.'))
                    + rida(t('Нашли, решив уравнение <b>f(x) = 0</b>. Проверка подстановкой:', 'Leidsime võrrandi <b>f(x) = 0</b> lahendamisel. Kontroll asendamisega:'))
                    + rida(`f(${xs}) = ${arv(f(x), 4)}`)
                    + jareldus(t(`Нуль функции: x = ${xs}`, `Nullkoht: x = ${xs}`));
            case 'y':
                return rida(t('На оси Oy всегда x = 0, поэтому подставляем x = 0:', 'y-teljel on alati x = 0, seega paneme x = 0:'))
                    + rida(`f(0) = ${arv(f(0), 4)}`)
                    + jareldus(t(`Пересечение с осью Oy: (0; ${arv(f(0), 3)})`, `Lõikepunkt y-teljega: (0; ${arv(f(0), 3)})`));
            case 'max':
            case 'min':
            case 'kp': {
                const a = d1(x - h), b = d1(x + h);
                const nimi = m.tuup === 'max' ? t('максимум', 'maksimum') : m.tuup === 'min' ? t('минимум', 'miinimum') : t('экстремума нет', 'ekstreemumit pole');
                return rida(t('Здесь производная равна нулю — касательная горизонтальна:', 'Siin on tuletis null – puutuja on horisontaalne:'))
                    + rida(`f'(${xs}) = ${arv(d1(x), 4)}`)
                    + rida(t('Смотрим знак производной слева и справа от точки:', 'Vaatame tuletise märki punktist vasakul ja paremal:'))
                    + rida(`f'(${vasak}) = ${arv(a, 3)} ${mark(a)}, &nbsp; f'(${parem}) = ${arv(b, 3)} ${mark(b)}`)
                    + rida(m.tuup === 'max' ? t('Знак меняется с + на − : функция росла, а потом начала убывать.', 'Märk muutub + → − : funktsioon kasvas ja hakkas siis kahanema.')
                        : m.tuup === 'min' ? t('Знак меняется с − на + : функция убывала, а потом начала расти.', 'Märk muutub − → + : funktsioon kahanes ja hakkas siis kasvama.')
                        : t('Знак не меняется — это не вершина и не впадина.', 'Märk ei muutu – see pole tipp ega org.'))
                    + rida(`y = f(${xs}) = ${arv(f(x), 4)}`)
                    + jareldus(`${t('Итог', 'Järeldus')}: ${nimi} (${xs}; ${arv(f(x), 3)})`);
            }
            case 'kaanu': {
                const a = d2(x - h), b = d2(x + h);
                return rida(t('Здесь вторая производная равна нулю:', 'Siin on teine tuletis null:'))
                    + rida(`f''(${xs}) = ${arv(d2(x), 4)}`)
                    + rida(t('Знак второй производной слева и справа:', 'Teise tuletise märk vasakul ja paremal:'))
                    + rida(`f''(${vasak}) = ${arv(a, 3)} ${mark(a)}, &nbsp; f''(${parem}) = ${arv(b, 3)} ${mark(b)}`)
                    + rida(a < 0 ? t('Изгиб меняется: ∩ (выпуклый) → ∪ (вогнутый).', 'Kõverdus muutub: ∩ (kumer) → ∪ (nõgus).') : t('Изгиб меняется: ∪ (вогнутый) → ∩ (выпуклый).', 'Kõverdus muutub: ∪ (nõgus) → ∩ (kumer).'))
                    + jareldus(t(`Точка перегиба: (${xs}; ${arv(f(x), 3)})`, `Käänupunkt: (${xs}; ${arv(f(x), 3)})`));
            }
        }
        return '';
    }

    const MARGI_JARJEKORD = ['null', 'y', 'max', 'min', 'kp', 'kaanu'];

    graafik.onMark = (m, koht) => {
        if (!olek.analuus) return;
        // samas kohas võib olla mitu punkti (nt x³ − 3x: nullkoht, y-telg ja käänupunkt on kõik (0; 0))
        const koos = olek.analuus.margid
            .filter(o => Math.abs(o.x - m.x) < 1e-6 && Math.abs(o.y - m.y) < 1e-6 && (!graafik.esile || graafik.esile.includes(o.tuup)))
            .sort((a, b) => MARGI_JARJEKORD.indexOf(a.tuup) - MARGI_JARJEKORD.indexOf(b.tuup));
        const osa = (p, i) => {
            const info = Graafik.MARGID[p.tuup] || Graafik.MARGID.kp;
            const reaVoti = MARGI_RIDA[p.tuup];
            const rida = olek.analuus.read.find(r => r.voti === reaVoti);
            return `${i > 0 ? '<hr />' : ''}
                <div class="margi-pea"><i style="border-color:${info.varv}"></i>${i === 0 ? t('Как нашли эту точку', 'Kuidas see punkt leiti') + ': ' : ''}${Valem.esc(info.nimi)}</div>
                ${margiSisu(p)}
                ${rida && rida.sammud.length ? `<details><summary>${t('Полное решение по шагам', 'Täielik lahenduskäik')}</summary>${sammudHtml(rida.sammud, false)}</details>` : ''}
                <button type="button" class="nupp-vaike" data-ava="${reaVoti}">${t('Открыть этот пункт →', 'Ava see punkt →')}</button>`;
        };
        selgitusEl.innerHTML = `<button type="button" class="margi-sulge" aria-label="${t('Закрыть', 'Sulge')}">×</button>`
            + (koos.length ? koos : [m]).map(osa).join('');
        selgitusEl.hidden = false;
        // paigutame punkti kõrvale, aga kasti piiresse
        const kast = selgitusEl.parentElement.getBoundingClientRect();
        const w = selgitusEl.offsetWidth, h = selgitusEl.offsetHeight;
        let vasak = koht.px + 14, ulal = koht.py + 14;
        if (vasak + w > kast.width - 8) vasak = Math.max(8, koht.px - w - 14);
        if (ulal + h > kast.height - 8) ulal = Math.max(8, kast.height - h - 8);
        selgitusEl.style.left = vasak + 'px';
        selgitusEl.style.top = ulal + 'px';
    };

    selgitusEl.addEventListener('click', e => {
        if (e.target.closest('.margi-sulge')) { selgitusEl.hidden = true; return; }
        const ava = e.target.closest('[data-ava]');
        if (ava) { selgitusEl.hidden = true; valiLeia(ava.dataset.ava, true); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') selgitusEl.hidden = true; });
    document.addEventListener('pointerdown', e => {
        if (!selgitusEl.hidden && !selgitusEl.contains(e.target) && e.target.id !== 'graafik') selgitusEl.hidden = true;
    });
    liugur.addEventListener('input', () => seaPunkt(+liugur.value, 'liugur'));
    x0Vali.addEventListener('input', () => seaPunkt(parseFloat(String(x0Vali.value).replace(',', '.')), 'vali'));

    function uuendaLiugurit() {
        const v = graafik.vaade;
        const samm = Math.pow(10, Math.floor(Math.log10((v.xMax - v.xMin) / 400)));
        liugur.min = Math.floor(v.xMin);
        liugur.max = Math.ceil(v.xMax);
        liugur.step = samm;
        liugur.value = olek.x0;
    }

    function arv(v, k = 4) {
        if (!Number.isFinite(v)) return '—';
        const r = Math.round(v * 10 ** k) / 10 ** k;
        return String(Object.is(r, -0) ? 0 : r).replace('-', '−').replace('.', ',');
    }

    function uuendaUurijat() {
        const a = graafik.punktiAndmed();
        if (!a) { uurijaInfo.innerHTML = ''; return; }
        if (!Number.isFinite(a.y)) {
            uurijaInfo.innerHTML = `<div><b>x₀ = ${arv(a.x)}</b></div><div class="halb">${t('Здесь функция не определена (x₀ не входит в область определения).', 'Siin funktsioon pole määratud (x₀ ei kuulu määramispiirkonda).')}</div>`;
            return;
        }
        const eps = 1e-6;
        const kasv = !Number.isFinite(a.k) ? '' : a.k > eps
            ? `<span class="hea">&gt; 0 ⇒ ${t('функция <b>возрастает ↗︎</b> (касательная идёт вверх)', 'funktsioon <b>kasvab ↗︎</b> (puutuja tõuseb)')}</span>`
            : a.k < -eps ? `<span class="halb">&lt; 0 ⇒ ${t('функция <b>убывает ↘︎</b> (касательная идёт вниз)', 'funktsioon <b>kahaneb ↘︎</b> (puutuja langeb)')}</span>`
            : `<span class="neutraalne">= 0 ⇒ ${t('касательная <b>горизонтальна</b> (здесь может быть экстремум)', 'puutuja on <b>horisontaalne</b> (siin võib olla ekstreemum)')}</span>`;
        const kum = !Number.isFinite(a.k2) ? '' : a.k2 > eps
            ? `<span class="lilla">&gt; 0 ⇒ ${t('график <b>вогнутый ∪</b>', 'graafik on <b>nõgus ∪</b>')}</span>`
            : a.k2 < -eps ? `<span class="oranz">&lt; 0 ⇒ ${t('график <b>выпуклый ∩</b>', 'graafik on <b>kumer ∩</b>')}</span>`
            : `<span class="neutraalne">= 0 ⇒ ${t('возможна точка перегиба', 'võimalik käänupunkt')}</span>`;
        let puutuja = '';
        if (Number.isFinite(a.k)) {
            const b = a.y - a.k * a.x;
            const kx = Math.abs(a.k) < eps ? '' : (Math.abs(a.k - 1) < eps ? 'x' : Math.abs(a.k + 1) < eps ? '−x' : arv(a.k, 3) + 'x');
            const vb = Math.abs(b) < eps ? '' : (kx ? (b > 0 ? ' + ' : ' − ') + arv(Math.abs(b), 3) : arv(b, 3));
            puutuja = `<div>${t('Касательная', 'Puutuja')}: <b>y = ${kx || vb ? kx + vb : '0'}</b></div>`;
        }
        const asend = a.y > eps ? t('график выше оси Ox', 'graafik on x-telje kohal')
            : a.y < -eps ? t('график ниже оси Ox', 'graafik on x-telje all') : t('график пересекает ось Ox', 'graafik lõikab x-telge');
        uurijaInfo.innerHTML = `
            <div class="uurija-rida"><span>${t('Точка', 'Punkt')}</span><b>(${arv(a.x, 3)}; ${arv(a.y, 3)})</b></div>
            <div class="uurija-rida"><span>f(x₀)</span><b>${arv(a.y)}</b> <span class="vihje">${asend}</span></div>
            <div class="uurija-rida"><span>f'(x₀)</span><b>${arv(a.k)}</b> ${kasv}</div>
            <div class="uurija-rida"><span>f''(x₀)</span><b>${arv(a.k2)}</b> ${kum}</div>
            ${puutuja}`;
    }

    [['naitaD1', 'd1'], ['naitaD2', 'd2'], ['naitaPuutuja', 'puutuja'], ['naitaNormaal', 'normaal']].forEach(([id, voti]) =>
        document.getElementById(id).addEventListener('change', e => { graafik.naita[voti] = e.target.checked; naitaLegendi(); graafik.joonista(); }));

    // Erilised punktid: üks lüliti – sees (punktid koos siltidega) või väljas. Valik jääb meelde.
    const punktidKast = document.getElementById('naitaPunktid');
    function seaPunktid(sees) {
        graafik.naita.margid = sees;
        graafik.naita.sildid = sees;
        punktidKast.checked = sees;
        if (!sees) selgitusEl.hidden = true;
        naitaLegendi();
        graafik.joonista();
    }
    punktidKast.addEventListener('change', () => {
        mali.kirjuta('punktid', punktidKast.checked);
        seaPunktid(punktidKast.checked);
    });
    seaPunktid(mali.loe('punktid', true));

    document.querySelectorAll('[data-suum]').forEach(n => n.addEventListener('click', () => {
        const s = n.dataset.suum;
        if (s === 'png') { laadiPng(); return; }
        if (s === 'sisse') graafik.suumi(1 / 1.4);
        else if (s === 'valja') graafik.suumi(1.4);
        else if (s === 'sobita') graafik.sobitaVaade();
        else graafik.yksYhele();
        uuendaLiugurit();
    }));

    function naitaLegendi() {
        const m = (varv, tekst) => `<span class="leg"><i style="background:${varv}"></i>${tekst}</span>`;
        const v = graafik.varv;
        let html = v === 'f'
            ? m('#16a34a', t('f(x) > 0 — график выше оси Ox', 'f(x) > 0 — graafik x-telje kohal')) + m('#dc2626', t('f(x) < 0 — график ниже оси Ox', 'f(x) < 0 — graafik x-telje all'))
            : v === 'd1' ? m('#16a34a', t("возрастает ↗︎ — f'(x) > 0", "kasvab ↗︎ — f'(x) > 0")) + m('#dc2626', t("убывает ↘︎ — f'(x) < 0", "kahaneb ↘︎ — f'(x) < 0"))
            : v === 'd2' ? m('#7c3aed', t("вогнутый ∪ — f''(x) > 0", "nõgus ∪ — f''(x) > 0")) + m('#ea580c', t("выпуклый ∩ — f''(x) < 0", "kumer ∩ — f''(x) < 0"))
            : m('#e11d48', 'f(x)');
        if (graafik.naita.d1) html += m('#7c3aed', t("f'(x) — пунктир", "f'(x) — katkendjoon"));
        if (graafik.naita.d2) html += m('#0891b2', t("f''(x) — точки", "f''(x) — punktiir"));
        const tuubid = new Set((graafik.naita.margid ? olek.analuus?.margid || [] : []).map(x => x.tuup).filter(tp => !graafik.esile || graafik.esile.includes(tp)));
        tuubid.forEach(tp => {
            const info = Graafik.MARGID[tp];
            if (info) html += `<span class="leg"><i class="ring" style="border-color:${info.varv}"></i>${info.nimi}</span>`;
        });
        html += `<span class="leg"><i class="ring" style="border-color:#0f172a"></i>x₀ — ${t('точка, которую можно двигать (не найденная точка)', 'liigutatav punkt (pole leitud punkt)')}</span>`;
        legendEl.innerHTML = html;
    }

    // ================= URL (jagamiseks) =================
    function uuendaUrl() {
        if (!olek.toores) return;
        const p = new URLSearchParams({ valem: olek.toores });
        if (olek.leia !== 'koik') p.set('leia', olek.leia);
        leiaParameetrid(olek.toores).forEach(n => p.set(n, olek.param[n]));
        history.replaceState(null, '', '/?' + p.toString());
    }

    // ================= ALGUS =================
    customElements.whenDefined('math-field').then(() => {
        // parameetrite väärtused lingist (?valem=a*x^2&a=2)
        new URLSearchParams(location.search).forEach((v, k) => {
            if (/^[a-wyz]$/.test(k) && Number.isFinite(parseFloat(v))) olek.param[k] = parseFloat(v);
        });
        // keele vahetuse järel: avatud read, punkt x₀ ja suum jäävad samaks (vt _Layout.cshtml)
        const keeleOlek = window.KEELE_OLEK;
        if (keeleOlek) {
            olek.lahti = new Set(keeleOlek.lahti || []);
            if (Number.isFinite(keeleOlek.x0)) olek.x0 = keeleOlek.x0;
            olek.taasta = keeleOlek;
        }
        seaValem(juur.dataset.valem);
        valiLeia(olek.leia, false);
        seaPunkt(olek.x0);
        olek.keri = !keeleOlek && juur.dataset.kerida === '1';   // juhendist või jagatud lingiga tulles
        analuusi('algus');
    });

    // _Layout.cshtml küsib keele vahetamisel, mida meeles pidada
    window.koguKeeleOlek = () => ({ lahti: [...olek.lahti], x0: olek.x0, vaade: { ...graafik.vaade } });
})();
