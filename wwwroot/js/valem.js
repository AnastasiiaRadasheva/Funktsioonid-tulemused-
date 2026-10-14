// Valemi abifunktsioonid: LaTeX (MathLive) -> valem serverile, valem -> ilus KaTeX.
// Vajab math.js-i (ja renderdamiseks KaTeX-i).
window.Valem = (function () {
    // ---------- LaTeX -> valem ----------
    function grupp(s, i) {
        while (s[i] === ' ') i++;
        if (s[i] !== '{') return [s[i] ?? '', i + 1];
        let d = 0, j = i;
        for (; j < s.length; j++) {
            if (s[j] === '{') d++;
            else if (s[j] === '}') { d--; if (d === 0) break; }
        }
        return [s.slice(i + 1, j), j + 1];
    }

    function tootle(s) {
        let out = '', i = 0;
        while (i < s.length) {
            if (s.startsWith('\\frac', i) || s.startsWith('\\dfrac', i)) {
                i += s.startsWith('\\dfrac', i) ? 6 : 5;
                const [a, i1] = grupp(s, i);
                const [b, i2] = grupp(s, i1);
                out += '((' + tootle(a) + ')/(' + tootle(b) + '))';
                i = i2;
            } else if (s.startsWith('\\sqrt', i)) {
                i += 5;
                let n = null;
                if (s[i] === '[') { const j = s.indexOf(']', i); n = s.slice(i + 1, j); i = j + 1; }
                const [a, i1] = grupp(s, i);
                out += n ? '((' + tootle(a) + ')^(1/(' + tootle(n) + ')))'
                         : '((' + tootle(a) + ')^(1/2))';
                i = i1;
            } else if (s[i] === 'e' && !s.startsWith('exp', i)) {
                let j = i + 1;
                while (s[j] === ' ') j++;
                if (s[j] === '^') { const [a, i1] = grupp(s, j + 1); out += 'exp(' + tootle(a) + ')'; i = i1; }
                else { out += 'exp(1)'; i++; }
            } else if (s[i] === '^') {
                const [a, i1] = grupp(s, i + 1);
                out += '^(' + tootle(a) + ')';
                i = i1;
            } else if (s[i] === '{') {
                const [a, i1] = grupp(s, i);
                out += '(' + tootle(a) + ')';
                i = i1;
            } else if (s[i] === '\\') {
                let j = i + 1;
                while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
                i = j;
            } else {
                out += s[i];
                i++;
            }
        }
        return out;
    }

    function latexValemiks(tex) {
        let s = tex
            .replace(/\\(left|right)\./g, '')
            .replace(/\\left|\\right/g, '')
            .replace(/\{,\}/g, '.')
            .replace(/\\[,;:! ]/g, '')
            .replace(/\\cdot|\\times/g, '*')
            .replace(/\\div/g, '/')
            .replace(/\\exponentialE/g, 'e')
            .replace(/\\(operatorname|mathrm)\{(\w+)\}/g, '$2')
            .replace(/\\(sin|cos|tan|ln|log|exp)(?![a-zA-Z])/g, '$1 ')
            .replace(/\\pi/g, '(3.14159265358979)')
            .replace(/−/g, '-');

        s = tootle(s);
        s = s.replace(/(sin|cos|tan|ln|exp)\s+(?=[0-9x])([0-9.]*x|[0-9.]+)/g, '$1($2)');
        s = s.replace(/([0-9x)])\s*(?=(?:sin|cos|tan|ln|exp)\b|x|\()/g, '$1*');
        s = s.replace(/\s+/g, '');
        // liigsed sulud ära: (x)^(3) -> x^3
        let eelmine;
        do {
            eelmine = s;
            s = s.replace(/\^\((-?\d+(?:\.\d+)?|x)\)/g, '^$1')
                 .replace(/(?<![a-z])\((x|\d+(?:\.\d+)?)\)/g, '$1');
        } while (s !== eelmine);
        // märgid korda: 1*x^2+-4*x -> x^2-4*x
        return s
            .replace(/\+-/g, '-')
            .replace(/-\+/g, '-')
            .replace(/--/g, '+')
            .replace(/(^|[+\-(])1\*(?=[a-z(])/g, '$1');
    }

    // ---------- valem -> TeX ----------
    function ilma(node) {
        return node && node.type === 'ParenthesisNode' ? node.content : node;
    }

    function kasitleja(node, valikud) {
        if (node.type === 'FunctionNode') {
            const nimi = node.fn && node.fn.name;
            if (nimi === 'exp') return 'e^{' + ilma(node.args[0]).toTex(valikud) + '}';
            if (nimi === 'ln' || nimi === 'log') return '\\ln\\left(' + node.args[0].toTex(valikud) + '\\right)';
            if (nimi === 'sqrt') return '\\sqrt{' + ilma(node.args[0]).toTex(valikud) + '}';
        }
        if (node.type === 'OperatorNode' && node.op === '^') {
            const e = ilma(node.args[1]);
            if (e.type === 'OperatorNode' && e.op === '/' &&
                e.args[0].type === 'ConstantNode' && e.args[1].type === 'ConstantNode' && Number(e.args[0].value) === 1) {
                const q = Number(e.args[1].value);
                const alus = ilma(node.args[0]).toTex(valikud);
                return q === 2 ? '\\sqrt{' + alus + '}' : '\\sqrt[' + q + ']{' + alus + '}';
            }
        }
        if (node.type === 'ConstantNode' && Math.abs(Number(node.value) - Math.PI) < 1e-9) return '\\pi';
        // 3*x -> 3x, 2*sin(x) -> 2sin(x)
        if (node.type === 'OperatorNode' && node.op === '*' && node.args.length === 2 && node.args[0].type === 'ConstantNode') {
            const p = node.args[1];
            const lihtne = p.type === 'SymbolNode' || p.type === 'FunctionNode' || p.type === 'ParenthesisNode' ||
                (p.type === 'OperatorNode' && p.op === '^' && p.args[0].type === 'SymbolNode');
            if (lihtne) return node.args[0].toTex(valikud) + p.toTex(valikud);
        }
        return undefined;
    }

    function tex(valem) {
        try {
            const t = math.parse(valem.replace(/3\.14159265358979/g, 'pi'))
                .toTex({ parenthesis: 'auto', handler: kasitleja });
            return t.replace(/\\mathrm\{(ln|exp)\}/g, '\\$1').replace(/\\cdot/g, '\\cdot ');
        } catch { return null; }
    }

    function esc(t) {
        const d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }

    function ilus(valem) {
        const t = tex(valem);
        return t && window.katex ? katex.renderToString(t, { throwOnError: false }) : esc(valem);
    }

    // Lahenduskäigu rida: tekstis [[...]] on valem
    function renderRida(tekst) {
        return tekst
            .split(/\[\[(.+?)\]\]/)
            .map((osa, i) => i % 2 ? ilus(osa) : esc(ilusTekst(osa)))
            .join('');
    }

    // x1 -> x₁, - -> − (ainult tavaline tekst)
    function ilusTekst(t) {
        const ala = '₀₁₂₃₄₅₆₇₈₉';
        return t.replace(/\bx(\d+)\b/g, (_, d) => 'x' + [...d].map(c => ala[+c]).join(''))
                .replace(/(^|[\s(;=\[{,])-(?=[\d∞√x])/g, '$1−');
    }

    return { latexValemiks, tex, ilus, esc, renderRida, ilusTekst };
})();
