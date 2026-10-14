using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using FunktsioonideUurimine.Models;
using MathNet.Symbolics;
using Expr = MathNet.Symbolics.Expression;

namespace FunktsioonideUurimine.Services;

public record GraafikuPunkt(double X, double? Y, double? Dy);

// Üks lahenduskäigu samm. Tekstis [[...]] = valem (joonistatakse ilusti KaTeX-iga)
// Voti on keelest sõltumatu (mp, null, t1 …), Pealkiri on valitud keeles
public record LahenduseSamm(string Pealkiri, List<string> Read, string Voti = "");

// Puutuja ja normaal punktis x0
public record PuutujaTulemus(bool Korras, string Viga, double X0, double Y0,
    double? K, double? B, double? Kn, double? Bn,
    bool PuutujaVertikaalne, bool NormaalVertikaalne,
    string Puutuja, string Normaal, List<string> Read);

// Eriline punkt graafikul: null, y, kp, max, min, kaanu
public record GraafikuMark(double X, double Y, string Tuup);

// Funktsiooni väärtus punktis a
public record VaartusTulemus(bool Korras, string Viga, string Vastus, List<string> Read);

// Vahemik määramispiirkonnas
public record Vahemik(double A, double B, bool AKaasa, bool BKaasa);

public class FunktsiooniAnaluusija
{
    private const int Piir = 20;              // otsime vahemikust [-20; 20]
    private const double Eps = 1e-9;
    private static readonly Expr X = Expr.Symbol("x");
    private static readonly CultureInfo K = CultureInfo.InvariantCulture;

    // Tekstide keel ("ru" või "et"). Analüüs on sünkroonne, seega piisab lõimepõhisest väljast.
    [ThreadStatic] private static string? _keel;
    private static string L(string ru, string et) => _keel == "ru" ? ru : et;
    private static string Pole => L("нет", "puuduvad");      // vahemikke pole
    private static string PoleS => L("Нет", "Puuduvad");     // punkte pole

    public static string Normaliseeri(string valem)
    {
        var v = valem.Trim().ToLowerInvariant().Replace("**", "^").Replace(",", ".");
        v = Regex.Replace(v, @"(\d)\s*(?=[a-z(])", "$1*");   // 2x -> 2*x
        v = Regex.Replace(v, @"\)\s*(?=[\w(])", ")*");        // (x+1)(x-1) -> (x+1)*(x-1)
        v = Regex.Replace(v, @"\bx\s*(?=\()", "x*");          // x(x+1) -> x*(x+1)
        return v;
    }

    // Salvestatud määramispiirkond: kui selle sisestas kasutaja, tagastab selle; kui see on arvutatud, siis null
    public static string? KasutajaMaaramispiirkond(string? salvestatud)
    {
        if (string.IsNullOrWhiteSpace(salvestatud)) return null;
        var s = salvestatud.Trim();
        return s.StartsWith("D(f) = ") || s.StartsWith("X = ") ? null : s;
    }

    public bool OnKorrektne(string valem, out string viga, string keel = "et")
    {
        _keel = keel;
        viga = string.Empty;
        Expr avaldis;
        try
        {
            avaldis = Infix.ParseOrThrow(Normaliseeri(valem));
        }
        catch
        {
            viga = L("Не удалось прочитать формулу. Проверьте скобки и знаки.", "Valemit ei õnnestunud lugeda. Kontrolli sulge ja märke.");
            return false;
        }

        try
        {
            Evaluate.Evaluate(Muutujad(0.123), avaldis);
            Calculus.Differentiate(X, Calculus.Differentiate(X, avaldis));
        }
        catch
        {
            viga = L("Формула может содержать только переменную x и функции sin, cos, tan, ln, exp.", "Valem tohib sisaldada ainult muutujat x ja funktsioone sin, cos, tan, ln, exp.");
            return false;
        }
        return true;
    }

    // ================= PÕHIANALÜÜS + LAHENDUSKÄIK =================
    public void Taida(FunktsiooniUurimine olem, string? kasutajaMp, string keel = "et")
    {
        _keel = keel;
        olem.Valem = Normaliseeri(olem.Valem);
        var f = Infix.ParseOrThrow(olem.Valem);
        var d1 = Calculus.Differentiate(X, f);
        var d2 = Calculus.Differentiate(X, d1);

        double F(double x) => Arvuta(f, x);
        double D1(double x) => Arvuta(d1, x);
        double D2(double x) => Arvuta(d2, x);

        // kui funktsioon/tuletised on polünoomid, saame täpsed kordajad
        var pf = LeiaPolunoom(F);
        var p1 = LeiaPolunoom(D1);

        olem.Tuletis = Struktuur(D1, olem.Valem)?.Tekst ?? Infix.Format(d1);
        olem.TeineTuletis = Struktuur(D2, olem.Valem)?.Tekst ?? Infix.Format(d2);

        var s = new List<LahenduseSamm>();

        // 1. Määramispiirkond
        var mp = LeiaMaaramispiirkond(F);
        olem.Maaramispiirkond = !string.IsNullOrWhiteSpace(kasutajaMp)
            ? kasutajaMp.Trim()
            : "X = " + MpTekst(mp);   // määramispiirkond on mõlemas keeles X
        var mpRead = new List<string> { $"f(x) = [[{olem.Valem}]]" };
        mpRead.AddRange(MaaramispiirkonnaSelgitus(olem.Valem));
        mpRead.Add(olem.Maaramispiirkond);
        s.Add(new(L("Область определения", "Määramispiirkond"), mpRead, "mp"));
        olem.Margid.Clear();

        // 1b. Lõikepunkt y-teljega
        double fNull = F(0);
        if (double.IsNaN(fNull))
        {
            olem.YLoikepunkt = L(PoleS, "Puudub");
            s.Add(new(L("Пересечение с осью Oy", "Lõikepunkt y-teljega"), new()
            {
                L("График пересекает ось Oy там, где x = 0.", "Graafik lõikab y-telge kohas, kus x = 0."),
                L("x = 0 не входит в область определения ⇒ график не пересекает ось Oy.", "x = 0 ei kuulu määramispiirkonda ⇒ graafik y-telge ei lõika.")
            }, "y"));
        }
        else
        {
            olem.YLoikepunkt = $"(0; {Arv(fNull)})";
            olem.Margid.Add(new(0, fNull, "y"));
            s.Add(new(L("Пересечение с осью Oy", "Lõikepunkt y-teljega"), new()
            {
                L("График пересекает ось Oy там, где x = 0. Подставляем x = 0 в формулу:", "Graafik lõikab y-telge kohas, kus x = 0. Asendame valemisse x = 0:"),
                $"f(0) = {Asenda(olem.Valem, 0)}{Arv(fNull)}",
                L("Точка пересечения с осью Oy: ", "Lõikepunkt y-teljega: ") + olem.YLoikepunkt
            }, "y"));
        }

        // 2. Nullkohad
        var nk = LeiaNullkohad(F);
        olem.Nullkohad = nk == null ? L("f(x) = 0 при любом x", "f(x) = 0 iga x korral")
            : nk.Count == 0 ? PoleS : Loetelu(nk);
        var nkRead = new List<string> { L("Решаем уравнение", "Lahendame võrrandi") + $" f(x) = 0: [[{(pf != null ? PolyInfix(pf, "x") : olem.Valem)} == 0]]" };
        nkRead.AddRange(LahendaVorrand(F, olem.Valem, nk));
        nkRead.Add(L("Нули: ", "Nullkohad: ") + olem.Nullkohad);
        s.Add(new(L("Нули функции", "Nullkohad"), nkRead, "null"));
        if (nk != null)
            foreach (var z in nk) olem.Margid.Add(new(z, 0, "null"));

        // 2b. Positiivsus- ja negatiivsuspiirkond
        if (nk == null)
        {
            olem.Positiivsus = Pole;
            olem.Negatiivsus = Pole;
            s.Add(new(L("Промежутки знакопостоянства", "Positiivsus- ja negatiivsuspiirkond"), new() { L("f(x) = 0 при любом x, поэтому промежутков знакопостоянства нет.", "f(x) = 0 iga x korral, seega positiivsus- ja negatiivsuspiirkonda pole.") }, "marg"));
        }
        else
        {
            var (pos, neg, mRead) = MargiVahemikud(F, nk, mp, "f", "f(x) > 0", "f(x) < 0");
            olem.Positiivsus = pos;
            olem.Negatiivsus = neg;
            var margRead = new List<string>
            {
                L("Нули делят область определения на промежутки. Из каждого промежутка берём пробную точку и находим знак f(x):", "Nullkohad jaotavad määramispiirkonna vahemikeks. Igast vahemikust võtame proovipunkti ja arvutame f(x) märgi:")
            };
            margRead.AddRange(mRead);
            margRead.Add(L("f(x) > 0 (график выше оси Ox): ", "Positiivsuspiirkond X⁺ (graafik on x-telje kohal): ") + Hulk(pos));
            margRead.Add(L("f(x) < 0 (график ниже оси Ox): ", "Negatiivsuspiirkond X⁻ (graafik on x-telje all): ") + Hulk(neg));
            s.Add(new(L("Промежутки знакопостоянства", "Positiivsus- ja negatiivsuspiirkond"), margRead, "marg"));
        }

        // 3. Esimene tuletis
        var t1Read = TuletiseSelgitus(pf, olem.Valem, "f(x)");
        t1Read.Add($"f'(x) = [[{olem.Tuletis}]]");
        s.Add(new(L("Первая производная", "Esimene tuletis"), t1Read, "t1"));

        // 4. Kriitilised punktid, monotoonsus, ekstreemumid
        var kp = LeiaNullkohad(D1);
        if (kp == null)
        {
            olem.KriitilisedPunktid = L("f'(x) = 0 при любом x", "f'(x) = 0 iga x korral");
            olem.Kasvamisvahemikud = Pole;
            olem.Kahanemisvahemikud = Pole;
            olem.Ekstreemumid = PoleS;
            s.Add(new(L("Монотонность", "Monotoonsus"), new() { L("f'(x) = 0 – функция постоянна, экстремумов нет.", "f'(x) = 0 – funktsioon on konstantne, ekstreemumeid pole.") }, "mono"));
        }
        else
        {
            olem.KriitilisedPunktid = kp.Count == 0 ? PoleS : Loetelu(kp);
            var kpRead = new List<string> { L("Решаем уравнение", "Lahendame võrrandi") + $" f'(x) = 0: [[{olem.Tuletis} == 0]]" };
            kpRead.AddRange(LahendaVorrand(D1, olem.Valem, kp));
            kpRead.Add(L("Критические точки: ", "Kriitilised punktid: ") + olem.KriitilisedPunktid);
            s.Add(new(L("Критические точки", "Kriitilised punktid"), kpRead, "kp"));

            var (kasv, kah, mRead) = MargiVahemikud(D1, kp, mp, "f'", L("возрастает ↗︎", "kasvab ↗︎"), L("убывает ↘︎", "kahaneb ↘︎"));
            olem.Kasvamisvahemikud = kasv;
            olem.Kahanemisvahemikud = kah;
            var monRead = new List<string>
            {
                L("Критические точки делят область определения на промежутки. Из каждого промежутка берём пробную точку и находим знак f'(x):", "Kriitilised punktid jaotavad määramispiirkonna vahemikeks. Igast vahemikust võtame proovipunkti ja arvutame f'(x) märgi:")
            };
            monRead.AddRange(mRead);
            monRead.Add(L("f'(x) > 0 ⇒ функция возрастает: ", "f'(x) > 0 ⇒ funktsioon kasvab: ") + Hulk(kasv));
            monRead.Add(L("f'(x) < 0 ⇒ функция убывает: ", "f'(x) < 0 ⇒ funktsioon kahaneb: ") + Hulk(kah));
            s.Add(new(L("Возрастание и убывание", "Kasvamine ja kahanemine"), monRead, "mon"));

            var ekst = new List<string>();
            var ekstRead = new List<string>();
            foreach (var c in kp)
            {
                double v = D1(c - 1e-3), p = D1(c + 1e-3);
                string y = Arv(F(c));
                if (!double.IsNaN(F(c)))
                    olem.Margid.Add(new(c, F(c), v > 0 && p < 0 ? "max" : v < 0 && p > 0 ? "min" : "kp"));
                string asendus = $"y = f({Arv(c)}) = {Asenda(olem.Valem, c)}{y}";
                if (v > 0 && p < 0)
                {
                    ekst.Add($"max = {y} (x = {Arv(c)})");
                    ekstRead.Add($"x = {Arv(c)}: " + L("знак f'(x) меняется с + на − ⇒ локальный максимум", "f'(x) märk muutub + → − ⇒ lokaalne maksimum"));
                    ekstRead.Add(asendus);
                }
                else if (v < 0 && p > 0)
                {
                    ekst.Add($"min = {y} (x = {Arv(c)})");
                    ekstRead.Add($"x = {Arv(c)}: " + L("знак f'(x) меняется с − на + ⇒ локальный минимум", "f'(x) märk muutub − → + ⇒ lokaalne miinimum"));
                    ekstRead.Add(asendus);
                }
                else
                {
                    ekstRead.Add($"x = {Arv(c)}: " + L("знак f'(x) не меняется ⇒ экстремума нет", "f'(x) märk ei muutu ⇒ ekstreemumit pole"));
                }
            }
            olem.Ekstreemumid = ekst.Count == 0 ? PoleS : string.Join(", ", ekst);
            if (ekstRead.Count == 0) ekstRead.Add(L("Критических точек нет, значит, экстремумов нет.", "Kriitilisi punkte pole, seega ekstreemumeid pole."));
            s.Add(new(L("Экстремумы", "Ekstreemumid"), ekstRead, "ekst"));
        }

        // 5. Teine tuletis
        var t2Read = TuletiseSelgitus(p1, Infix.Format(d1), "f'(x)");
        t2Read.Add($"f''(x) = [[{olem.TeineTuletis}]]");
        s.Add(new(L("Вторая производная", "Teine tuletis"), t2Read, "t2"));

        // 6. Käänupunktid, kumerus, nõgusus
        var k2 = LeiaNullkohad(D2);
        if (k2 == null)
        {
            olem.Kaanupunktid = PoleS;
            olem.Kumerusvahemikud = Pole;
            olem.Nogususvahemikud = Pole;
            s.Add(new(L("Выпуклость и вогнутость", "Kumerus ja nõgusus"), new() { L("f''(x) = 0 – график прямая, точек перегиба нет.", "f''(x) = 0 – graafik on sirge, käänupunkte pole.") }, "kum"));
        }
        else
        {
            var k2Read = new List<string> { L("Решаем уравнение", "Lahendame võrrandi") + $" f''(x) = 0: [[{olem.TeineTuletis} == 0]]" };
            k2Read.AddRange(LahendaVorrand(D2, olem.Valem, k2));
            s.Add(new(L("Нули второй производной", "Teise tuletise nullkohad"), k2Read, "t2n"));

            var (nogus, kumer, kRead0) = MargiVahemikud(D2, k2, mp, "f''", L("вогнута ∪", "nõgus ∪"), L("выпукла ∩", "kumer ∩"));
            olem.Nogususvahemikud = nogus;
            olem.Kumerusvahemikud = kumer;
            var kumRead = new List<string> { L("Нули второй производной делят область определения на промежутки. Смотрим знак f''(x):", "Teise tuletise nullkohad jaotavad määramispiirkonna vahemikeks. Vaatame f''(x) märki:") };
            kumRead.AddRange(kRead0);
            kumRead.Add(L("f''(x) < 0 ⇒ график выпуклый (∩): ", "f''(x) < 0 ⇒ graafik on kumer (∩): ") + Hulk(kumer));
            kumRead.Add(L("f''(x) > 0 ⇒ график вогнутый (∪): ", "f''(x) > 0 ⇒ graafik on nõgus (∪): ") + Hulk(nogus));
            s.Add(new(L("Выпуклость и вогнутость", "Kumerus ja nõgusus"), kumRead, "kum"));

            var kaanud = new List<string>();
            var kRead = new List<string>();
            foreach (var c in k2)
            {
                double v = D2(c - 1e-3), p = D2(c + 1e-3);
                if (!double.IsNaN(v) && !double.IsNaN(p) && Math.Sign(v) != Math.Sign(p) && !double.IsNaN(F(c)))
                {
                    string y = Arv(F(c));
                    string punkt = $"({Arv(c)}; {y})";
                    kaanud.Add(punkt);
                    olem.Margid.Add(new(c, F(c), "kaanu"));
                    kRead.Add($"x = {Arv(c)}: " + L("f''(x) меняет знак ⇒ точка перегиба", "f''(x) muudab märki ⇒ käänupunkt"));
                    kRead.Add($"y = f({Arv(c)}) = {Asenda(olem.Valem, c)}{y}  ⇒  K{punkt}");
                }
                else
                {
                    kRead.Add($"x = {Arv(c)}: " + L("знак f''(x) не меняется ⇒ точки перегиба нет", "f''(x) märk ei muutu ⇒ käänupunkti pole"));
                }
            }
            olem.Kaanupunktid = kaanud.Count == 0 ? PoleS : string.Join(", ", kaanud);
            if (kRead.Count == 0) kRead.Add(L("f''(x) никогда не равна нулю, точек перегиба нет.", "f''(x) ei võrdu kunagi nulliga, käänupunkte pole."));
            s.Add(new(L("Точки перегиба", "Käänupunktid"), kRead, "kaanu"));
        }

        // 7. Vastus
        s.Add(new(L("Ответ", "Vastus"), new()
        {
            olem.Maaramispiirkond,
            L("Точка пересечения с осью Oy: ", "Lõikepunkt y-teljega: ") + olem.YLoikepunkt,
            L("Нули: ", "Nullkohad: ") + olem.Nullkohad,
            "f > 0: " + Hulk(olem.Positiivsus) + ";  f < 0: " + Hulk(olem.Negatiivsus),
            L("Возрастает: ", "Kasvab: ") + Hulk(olem.Kasvamisvahemikud) + L(";  убывает: ", ";  kahaneb: ") + Hulk(olem.Kahanemisvahemikud),
            L("Экстремумы: ", "Ekstreemumid: ") + olem.Ekstreemumid,
            L("Выпукла (∩): ", "Kumer (∩): ") + Hulk(olem.Kumerusvahemikud) + L(";  вогнута (∪): ", ";  nõgus (∪): ") + Hulk(olem.Nogususvahemikud),
            L("Точки перегиба: ", "Käänupunktid: ") + olem.Kaanupunktid
        }, "vastus"));

        olem.Sammud = s;
        olem.Lahendus = JsonSerializer.Serialize(s);
    }

    // ================= VÄÄRTUS PUNKTIS =================
    public VaartusTulemus Vaartus(string valem, double a, string keel = "et")
    {
        _keel = keel;
        var v = Normaliseeri(valem);
        var f = Infix.ParseOrThrow(v);
        double y = Arvuta(f, a);
        string asTekst = a.ToString("0.######", K);
        var read = new List<string>
        {
            L($"Чтобы найти значение функции, подставляем вместо каждого x число {asTekst}.", $"Funktsiooni väärtuse leidmiseks asendame valemis iga x arvuga {asTekst}."),
            $"f(x) = [[{v}]]"
        };
        if (double.IsNaN(y))
        {
            read.Add(L($"Вычислить нельзя: x = {asTekst} не входит в область определения (например, деление на ноль, корень или логарифм отрицательного числа).", $"Arvutada ei saa: x = {asTekst} ei kuulu määramispiirkonda (nt nulliga jagamine, negatiivse arvu juur või logaritm)."));
            return new(false, L($"f({asTekst}) не определено.", $"f({asTekst}) ei ole määratud."), "", read);
        }

        string asendus = v.Length <= 80 ? "[[" + Regex.Replace(v, @"\bx\b", "(" + asTekst + ")") + "]] = " : "";
        string vastus = Arv(y);
        read.Add($"f({asTekst}) = {asendus}{vastus}" + (vastus.Contains('/') || vastus.Contains('√') ? $" ≈ {Kumm(y)}" : ""));
        read.Add(L($"Точка ({asTekst}; {vastus}) лежит на графике функции.", $"Punkt ({asTekst}; {vastus}) asub funktsiooni graafikul."));
        return new(true, "", $"f({asTekst}) = {vastus}", read);
    }

    // Graafiku punktid (f ja f')
    public List<GraafikuPunkt> ArvutaPunktid(string valem, double min, double max, double samm)
    {
        var f = Infix.ParseOrThrow(Normaliseeri(valem));
        var df = Calculus.Differentiate(X, f);
        int n = (int)Math.Round((max - min) / samm);
        var punktid = new List<GraafikuPunkt>(n + 1);
        for (int i = 0; i <= n; i++)
        {
            double x = Math.Round(min + i * samm, 6);
            double y = Arvuta(f, x), dy = Arvuta(df, x);
            punktid.Add(new GraafikuPunkt(x, double.IsNaN(y) ? null : y, double.IsNaN(dy) ? null : dy));
        }
        return punktid;
    }

    // ================= PUUTUJA JA NORMAAL =================
    public PuutujaTulemus PuutujaJaNormaal(string valem, double x0, string keel = "et")
    {
        _keel = keel;
        var v = Normaliseeri(valem);
        var f = Infix.ParseOrThrow(v);
        var d1 = Calculus.Differentiate(X, f);
        var read = new List<string>();
        string xs = Arv(x0);

        double y0 = Arvuta(f, x0);
        if (double.IsNaN(y0))
            return new(false, L($"Точка x₀ = {xs} не входит в область определения.", $"Punkt x₀ = {xs} ei kuulu määramispiirkonda."), x0, 0, null, null, null, null, false, false, "", "", read);

        string ys = Arv(y0);
        string tuletis = Struktuur(x => Arvuta(d1, x), v)?.Tekst ?? Infix.Format(d1);
        double k = Arvuta(d1, x0);

        read.Add(L("Точка касания", "Puutepunkt") + $": x₀ = {xs},  y₀ = f({xs}) = {Asenda(v, x0)}{ys}");
        read.Add(L($"Точка касания P({xs}; {ys}).", $"Puutepunkt on P({xs}; {ys})."));

        if (double.IsNaN(k))
        {
            read.Add($"f'({xs}) " + L("не существует (производная стремится к бесконечности) ⇒ касательная вертикальна.", "ei eksisteeri (tuletis läheb lõpmatuks) ⇒ puutuja on vertikaalne sirge."));
            read.Add(L("Касательная", "Puutuja") + $": x = {xs}");
            read.Add(L("Нормаль перпендикулярна касательной, поэтому горизонтальна", "Normaal on puutujaga risti, seega horisontaalne") + $": y = {ys}");
            return new(true, "", x0, y0, null, null, 0, y0, true, false, $"x = {xs}", $"y = {ys}", read);
        }

        double b = y0 - k * x0;
        read.Add(L("Угловой коэффициент касательной равен значению производной в точке касания: k = f'(x₀).", "Puutuja tõus on tuletise väärtus puutepunktis: k = f'(x₀)."));
        read.Add($"f'(x) = [[{tuletis}]]");
        read.Add($"k = f'({xs}) = {Asenda(tuletis, x0)}{Arv(k)}");
        read.Add(L("Уравнение касательной", "Puutuja võrrand") + ": y − y₀ = f'(x₀) · (x − x₀)");
        read.Add($"y − {SulgS(ys)} = {Arv(k)} · ({XMiinus(x0)})");
        string puutuja = Sirge(k, b);
        read.Add(L("Раскрываем скобки и выражаем y", "Avame sulud ja avaldame y") + $": {puutuja}");

        if (Math.Abs(k) < 1e-12)
        {
            read.Add(L("k = 0 ⇒ касательная горизонтальна, нормаль (перпендикулярная ей) вертикальна.", "k = 0 ⇒ puutuja on horisontaalne, normaal (puutujaga risti) on vertikaalne."));
            read.Add(L("Нормаль", "Normaal") + $": x = {xs}");
            return new(true, "", x0, y0, k, b, null, null, false, true, puutuja, $"x = {xs}", read);
        }

        double kn = -1 / k;
        double bn = y0 - kn * x0;
        read.Add(L("Нормаль перпендикулярна касательной, поэтому её угловой коэффициент k_n = −1 / k.", "Normaal on puutujaga risti, seega tema tõus on k_n = −1 / k."));
        read.Add($"k_n = −1 / {SulgS(Arv(k))} = {Arv(kn)}");
        read.Add(L("Уравнение нормали", "Normaali võrrand") + ": y − y₀ = −1/f'(x₀) · (x − x₀)");
        read.Add($"y − {SulgS(ys)} = {Arv(kn)} · ({XMiinus(x0)})");
        string normaal = Sirge(kn, bn);
        read.Add(L("Раскрываем скобки и выражаем y", "Avame sulud ja avaldame y") + $": {normaal}");

        return new(true, "", x0, y0, k, b, kn, bn, false, false, puutuja, normaal, read);
    }

    private static string Sirge(double k, double b)
    {
        string abs = Arv(Math.Abs(k));
        string kord = abs.Contains('/') || abs.Contains('√') ? $"({abs})" : abs;
        string kx = Math.Abs(k) < 1e-12 ? ""
            : (k < 0 ? "−" : "") + (Math.Abs(Math.Abs(k) - 1) < 1e-12 ? "x" : kord + "x");
        if (kx == "") return "y = " + Arv(b).Replace("-", "−");
        if (Math.Abs(b) < 1e-12) return "y = " + kx;
        return "y = " + kx + (b > 0 ? " + " : " − ") + Arv(Math.Abs(b));
    }

    private static string XMiinus(double x0) =>
        Math.Abs(x0) < 1e-12 ? "x" : x0 > 0 ? $"x − {Arv(x0)}" : $"x + {Arv(-x0)}";

    private static string SulgS(string s) => s.StartsWith("-") || s.Contains('/') ? $"({s})" : s;

    // ================= SELGITUSED =================

    // Määramispiirkonna tingimused valemi järgi
    private static List<string> MaaramispiirkonnaSelgitus(string valem)
    {
        var read = new List<string>();
        foreach (var n in Nimetajad(valem))
            read.Add(L("Знаменатель не должен быть равен нулю", "Nimetaja ei tohi olla null") + $": [[{n} != 0]]");
        foreach (var a in FunktsiooniArgumendid(valem, "ln"))
            read.Add(L("Аргумент логарифма должен быть положительным", "Logaritmi argument peab olema positiivne") + $": [[{a} > 0]]");
        foreach (var a in JuureAlused(valem))
            read.Add(L("Под квадратным корнем должно быть неотрицательное число", "Ruutjuure all peab olema mittenegatiivne arv") + $": [[{a} >= 0]]");
        if (read.Count == 0)
            read.Add(L("В формуле нет дроби с x в знаменателе, логарифма или корня, поэтому функция определена при любом x.", "Valemis pole murdu x-ga nimetajas, logaritmi ega juurt, seega funktsioon on määratud iga x korral."));
        return read;
    }

    // Tuletise leidmise selgitus
    private static List<string> TuletiseSelgitus(Murd[]? poly, string valem, string mida)
    {
        var read = new List<string>();
        if (poly != null)
        {
            read.Add(L($"{mida} — многочлен. Дифференцируем каждое слагаемое по формулам (xⁿ)' = n·xⁿ⁻¹ и (c)' = 0:", $"{mida} on polünoom. Tuletame iga liikme eraldi valemitega (xⁿ)' = n·xⁿ⁻¹ ja (c)' = 0:"));
            var osad = new List<string>();
            for (int k = poly.Length - 1; k >= 0; k--)
            {
                if (poly[k].IsZero) continue;
                var tul = k == 0 ? "0" : Liige(poly[k] * new Murd(k), k - 1, true);
                osad.Add($"({Liige(poly[k], k, true)})' = {tul}");
            }
            read.Add(string.Join(",   ", osad));
            return read;
        }

        read.Add(L("Используем правила дифференцирования:", "Kasutame tuletise reegleid:"));
        var v = valem.Replace(" ", "");
        if (Regex.IsMatch(v, @"x\*(exp|sin|cos|tan|ln|\()|\)\*(x|exp|sin|cos|tan|ln|\()"))
            read.Add(L("производная произведения", "korrutise tuletis") + ": (u·v)' = u'·v + u·v'");
        if (Regex.IsMatch(v, @"/\(?[^)]*x"))
            read.Add(L("производная частного", "jagatise tuletis") + ": (u/v)' = (u'·v − u·v') / v²");
        if (v.Contains("exp(")) read.Add("(eᵘ)' = eᵘ · u'");
        if (v.Contains("ln(")) read.Add("(ln u)' = u' / u");
        if (v.Contains("sin(")) read.Add("(sin u)' = cos u · u'");
        if (v.Contains("cos(")) read.Add("(cos u)' = −sin u · u'");
        if (v.Contains("tan(")) read.Add("(tan u)' = u' / cos²u");
        read.Add("(xⁿ)' = n·xⁿ⁻¹,  (c)' = 0");
        return read;
    }

    // Avaldise kuju: polünoom, murd (lugeja/nimetaja) või e^(...)·polünoom
    private record Kuju(string Tuup, Murd[] Poly, string Tegur, string Tekst);

    private static Kuju? Struktuur(Func<double, double> g, string algValem)
    {
        var poly = LeiaPolunoom(g);
        if (poly != null) return new Kuju("poly", poly, "", PolyInfix(poly, "x"));

        var nimetajad = Nimetajad(algValem).Concat(FunktsiooniArgumendid(algValem, "ln")).Distinct().ToList();
        foreach (var n in nimetajad)
        {
            Func<double, double> nf;
            try { var ne = Infix.ParseOrThrow(n); nf = x => Arvuta(ne, x); } catch { continue; }
            for (int k = 1; k <= 4; k++)
            {
                int kk = k;
                var lugeja = LeiaPolunoom(x => g(x) * Math.Pow(nf(x), kk));
                if (lugeja == null) continue;
                string nimetaja = kk == 1 ? $"({n})" : $"({n})^{kk}";
                return new Kuju("murd", lugeja, nimetaja, $"({PolyInfix(lugeja, "x")})/{nimetaja}");
            }
        }

        foreach (var a in FunktsiooniArgumendid(algValem, "exp"))
        {
            Func<double, double> af;
            try { var ae = Infix.ParseOrThrow(a); af = x => Arvuta(ae, x); } catch { continue; }
            foreach (int m in new[] { 1, -1, 2, -2 })
            {
                int mm = m;
                var jaak = LeiaPolunoom(x => g(x) / Math.Exp(mm * af(x)));
                if (jaak == null) continue;
                string eks = mm == 1 ? $"exp({a})" : $"exp({mm}*({a}))";
                return new Kuju("exp", jaak, eks, $"{eks}*({PolyInfix(jaak, "x")})");
            }
        }
        return null;
    }

    // Võrrandi g(x) = 0 lahenduskäik
    private static List<string> LahendaVorrand(Func<double, double> g, string algValem, List<double>? numbrilised)
    {
        var read = new List<string>();
        if (numbrilised == null) return read;

        var kuju = Struktuur(g, algValem);
        if (kuju?.Tuup == "poly")
        {
            LahendaPolunoom(kuju.Poly, "x", read, new List<(double, string)>(), 0);
            return read;
        }
        if (kuju?.Tuup == "murd")
        {
            read.Add(L($"Дробь равна нулю, когда числитель равен нулю (знаменатель [[{kuju.Tegur}]] не должен быть равен нулю).", $"Murd võrdub nulliga, kui lugeja on null (nimetaja [[{kuju.Tegur}]] ei tohi olla null)."));
            read.Add(L("Числитель", "Lugeja") + $": [[{PolyInfix(kuju.Poly, "x")} == 0]]");
            LahendaPolunoom(kuju.Poly, "x", read, new List<(double, string)>(), 0);
            return read;
        }
        if (kuju?.Tuup == "exp")
        {
            read.Add(L($"Выносим множитель [[{kuju.Tegur}]] за скобки", $"Toome teguri [[{kuju.Tegur}]] sulgude ette") + $": [[{kuju.Tekst} == 0]]");
            read.Add(L($"Так как [[{kuju.Tegur} > 0]] при любом x, этот множитель не равен нулю. Остаётся решить:", $"Kuna [[{kuju.Tegur} > 0]] iga x korral, siis see tegur nulliga ei võrdu. Jääb lahendada:"));
            read.Add($"[[{PolyInfix(kuju.Poly, "x")} == 0]]");
            LahendaPolunoom(kuju.Poly, "x", read, new List<(double, string)>(), 0);
            return read;
        }

        read.Add(L("Это уравнение нельзя точно решить простыми способами. Находим корни приближённо: ищем, где функция меняет знак, и уточняем методом деления пополам.", "Seda võrrandit ei saa lihtsate võtetega täpselt lahendada. Leiame lahendid ligikaudselt: otsime, kus funktsioon muudab märki, ja täpsustame poolitusmeetodiga."));
        read.Add(numbrilised.Count == 0 ? L("Смена знака не найдена – корней нет.", "Märgimuutust ei leitud – lahendid puuduvad.") : string.Join(", ", numbrilised.Select(v => "x ≈ " + Arv(v))));
        return read;
    }

    // Polünoomvõrrandi lahendamine sammhaaval (diskriminant, sulgude ette toomine, Horner, bikvadraat)
    private static void LahendaPolunoom(Murd[] a, string v, List<string> read, List<(double v, string s)> juured, int sugavus)
    {
        a = Trim(a);
        int n = a.Length - 1;
        if (n < 0 || (n == 0 && a[0].IsZero)) { read.Add(L("Равенство верно при любом x.", "Võrdus kehtib iga x korral.")); return; }
        if (n == 0) { read.Add($"{a[0]} ≠ 0, " + L("поэтому уравнение не имеет решений.", "seega võrrandil lahendid puuduvad.")); return; }
        if (sugavus > 8) { read.Add(L("Остальные корни находим численно.", "Leiame ülejäänud lahendid numbriliselt.")); return; }

        // täisarvulised kordajad ja positiivne juhtkordaja
        var (b, tegur) = Taisarvuliseks(a);
        if (!(tegur.P == 1 && tegur.Q == 1))
        {
            string tekst = tegur.Q == 1
                ? (tegur.P == -1 ? L("Умножаем обе части уравнения на (−1)", "Korrutame võrrandi mõlemad pooled (−1)-ga") : L("Умножаем обе части уравнения на", "Korrutame võrrandi mõlemad pooled arvuga") + $" {tegur.P}")
                : (Math.Abs(tegur.P) == 1 ? L("Делим обе части уравнения на", "Jagame võrrandi mõlemad pooled arvuga") + $" {tegur.P * tegur.Q}" : L("Умножаем обе части уравнения на", "Korrutame võrrandi mõlemad pooled arvuga") + $" {tegur}");
            read.Add($"{tekst}: [[{PolyInfix(b, v)} == 0]]");
        }
        a = b;

        // v^k sulgude ette
        int k = 0;
        while (a[k].IsZero) k++;
        if (k > 0)
        {
            var rest = a.Skip(k).ToArray();
            juured.Add((0, "0"));
            if (rest.Length == 1)
            {
                read.Add(k == 1 ? $"{v} = 0" : $"{v}{Sup(k)} = 0 ⇒ {v} = 0");
                return;
            }
            read.Add(L($"Выносим {v}{Sup(k)} за скобки", $"Toome {v}{Sup(k)} sulgude ette") + $": [[{Mono(k, v)}*({PolyInfix(rest, v)}) == 0]]");
            read.Add(L("Произведение равно нулю, когда хотя бы один множитель равен нулю:", "Korrutis võrdub nulliga, kui vähemalt üks tegur on null:") + " "
                     + (k == 1 ? $"{v} = 0" : $"{v}{Sup(k)} = 0 ⇒ {v} = 0 ({k}-" + L("кратный корень", "kordne lahend") + ")"));
            if (rest.Length > 1)
            {
                read.Add(L("или", "või") + $" [[{PolyInfix(rest, v)} == 0]]");
                LahendaPolunoom(rest, v, read, juured, sugavus + 1);
            }
            return;
        }

        n = a.Length - 1;
        if (n == 1)
        {
            var r = -a[0] / a[1];
            read.Add(L("Линейное уравнение", "Lineaarvõrrand") + $": [[{Liige(a[1], 1, false, v)} == {(-a[0]).ToString()}]]  ⇒  {v} = {r}");
            juured.Add((r.D, r.ToString()));
            return;
        }

        if (n == 2)
        {
            Ruutvorrand(a[2].P, a[1].P, a[0].P, v, read, juured);
            return;
        }

        if (n == 4 && a[1].IsZero && a[3].IsZero)
        {
            read.Add(L("Биквадратное уравнение (только чётные степени). Делаем замену", "Bikvadraatvõrrand (ainult paarisastmed). Teeme asenduse") + $" t = {v}²:");
            read.Add($"[[{PolyInfix(new[] { a[0], a[2], a[4] }, "t")} == 0]]");
            var tJuured = new List<(double v, string s)>();
            Ruutvorrand(a[4].P, a[2].P, a[0].P, "t", read, tJuured);
            read.Add(L("Обратная замена", "Tagasi asendus") + $" {v}² = t:");
            foreach (var (tv, ts) in tJuured)
            {
                if (tv < -1e-12) read.Add($"{v}² = {ts} < 0 ⇒ " + L("корней нет", "lahendeid pole"));
                else if (Math.Abs(tv) < 1e-12) { read.Add($"{v}² = 0 ⇒ {v} = 0"); juured.Add((0, "0")); }
                else
                {
                    string juur = ts.Contains('√') ? $"√({ts})" : JuurTekst(Murd.FromDouble(tv) ?? new Murd(0));
                    read.Add($"{v}² = {ts} ⇒ {v} = ±{juur}");
                    juured.Add((-Math.Sqrt(tv), "-" + juur));
                    juured.Add((Math.Sqrt(tv), juur));
                }
            }
            return;
        }

        // ratsionaalsete juurte otsimine + Horneri skeem
        long a0 = a[0].P, an = a[n].P;
        var kandidaadid = new List<Murd>();
        if (Math.Abs(a0) <= 1_000_000 && Math.Abs(an) <= 1_000_000)
        {
            foreach (var p in Jagajad(Math.Abs(a0)))
                foreach (var q in Jagajad(Math.Abs(an)))
                {
                    kandidaadid.Add(new Murd(p, q));
                    kandidaadid.Add(new Murd(-p, q));
                }
        }
        foreach (var r in kandidaadid.Distinct().OrderBy(m => Math.Abs(m.D)).ThenBy(m => -m.D))
        {
            if (!Vaartus(a, r).IsZero) continue;
            read.Add(an == 1
                ? L($"Ищем целый корень среди делителей свободного члена {a0}: {v} = {r} подходит, так как P({r}) = 0.", $"Otsime täisarvulist lahendit vabaliikme {a0} jagajate hulgast: {v} = {r} sobib, sest P({r}) = 0.")
                : L($"Ищем рациональный корень вида p/q (p делит {a0}, q делит {an}): {v} = {r} подходит, так как P({r}) = 0.", $"Otsime ratsionaalset lahendit kujul p/q (p jagab arvu {a0}, q jagab arvu {an}): {v} = {r} sobib, sest P({r}) = 0."));
            juured.Add((r.D, r.ToString()));
            var jagatis = Horner(a, r);
            read.Add(L($"Делим многочлен на ({Lin(r, v)}) по схеме Горнера", $"Jagame polünoomi teguriga ({Lin(r, v)}) Horneri skeemiga") + $": [[{PolyInfix(a, v)} == ({Lin(r, v)})*({PolyInfix(jagatis, v)})]]");
            if (jagatis.Length > 1)
            {
                read.Add(L("Остаётся решить", "Jääb lahendada") + $": [[{PolyInfix(jagatis, v)} == 0]]");
                LahendaPolunoom(jagatis, v, read, juured, sugavus + 1);
            }
            return;
        }

        // ratsionaalseid lahendeid pole -> numbriliselt
        read.Add(L("Рациональных корней нет. Находим корни приближённо (метод деления пополам):", "Ratsionaalseid lahendeid ei leidu. Leiame lahendid ligikaudselt (poolitusmeetod):"));
        var numb = LeiaNullkohad(x => VaartusD(a, x)) ?? new List<double>();
        read.Add(numb.Count == 0 ? L("Действительных корней нет.", "Reaalarvulisi lahendeid pole.") : string.Join(", ", numb.Select(z => $"{v} ≈ {Arv(z)}")));
        foreach (var z in numb) juured.Add((z, Arv(z)));
    }

    private static void Ruutvorrand(long A, long B, long C, string v, List<string> read, List<(double v, string s)> juured)
    {
        read.Add(L("Квадратное уравнение", "Ruutvõrrand") + $" [[{PolyInfix(new[] { new Murd(C), new Murd(B), new Murd(A) }, v)} == 0]], " + L("коэффициенты", "kordajad") + $": a = {A}, b = {B}, c = {C}.");
        long D = B * B - 4 * A * C;
        read.Add(L("Дискриминант", "Diskriminant") + $": D = b² − 4ac = {Sulg(B)}² − 4·{Sulg(A)}·{Sulg(C)} = {D}");

        if (D < 0)
        {
            read.Add(L("D < 0 ⇒ действительных корней нет.", "D < 0 ⇒ reaalarvulisi lahendeid pole."));
            return;
        }
        if (D == 0)
        {
            var r = new Murd(-B, 2 * A);
            read.Add(L("D = 0 ⇒ один (двукратный) корень", "D = 0 ⇒ üks (kahekordne) lahend") + $": [[{v} == (-b)/(2*a) == ({-B})/({2 * A})]] = {r}");
            juured.Add((r.D, r.ToString()));
            return;
        }

        read.Add(L("D > 0 ⇒ два корня по формуле", "D > 0 ⇒ kaks lahendit valemiga") + $" {v}₁,₂ = (−b ± √D) / (2a)");
        var (kk, m) = JuureLihtsustus(D);
        if (m == 1)
        {
            var r1 = new Murd(-B - kk, 2 * A);
            var r2 = new Murd(-B + kk, 2 * A);
            read.Add($"√D = √{D} = {kk}");
            read.Add($"{v}₁ = [[({-B} - {kk})/({2 * A})]] = {r1},   {v}₂ = [[({-B} + {kk})/({2 * A})]] = {r2}");
            juured.Add((r1.D, r1.ToString()));
            juured.Add((r2.D, r2.ToString()));
        }
        else
        {
            string s1 = JuureVorm(-B, kk, m, 2 * A, -1), s2 = JuureVorm(-B, kk, m, 2 * A, 1);
            double v1 = (-B - Math.Sqrt(D)) / (2.0 * A), v2 = (-B + Math.Sqrt(D)) / (2.0 * A);
            read.Add($"√D = √{D}" + (kk > 1 ? $" = {kk}√{m}" : ""));
            read.Add($"{v}₁ = [[({-B} - sqrt({D}))/({2 * A})]] = {s1} ≈ {Kumm(v1)}");
            read.Add($"{v}₂ = [[({-B} + sqrt({D}))/({2 * A})]] = {s2} ≈ {Kumm(v2)}");
            juured.Add((v1, s1));
            juured.Add((v2, s2));
        }
    }

    // y = f(c) asendus (ainult ilusate arvude korral)
    private static string Asenda(string valem, double c)
    {
        string a = Arv(c);
        if (a.Contains('√') || a.Contains('.') || valem.Length > 60) return "";
        return "[[" + Regex.Replace(valem, @"\bx\b", "(" + a + ")") + "]] = ";
    }

    // ================= ABIMEETODID: arvutamine =================

    private static Dictionary<string, FloatingPoint> Muutujad(double x) => new() { { "x", x } };

    private static double Arvuta(Expr avaldis, double x)
    {
        try
        {
            var tulemus = Evaluate.Evaluate(Muutujad(x), avaldis);
            if (!tulemus.IsReal) return double.NaN;     // kompleksarv / lõpmatus -> pole määratud (ilma erindita = kiire)
            double v = tulemus.RealValue;
            return double.IsFinite(v) ? v : double.NaN;
        }
        catch
        {
            return double.NaN;
        }
    }

    // g(x) = 0 lahendid vahemikus [-20; 20]. null = g on nullfunktsioon.
    private static List<double>? LeiaNullkohad(Func<double, double> g)
    {
        var leitud = new List<double>();
        double eelmX = double.NaN, eelmY = double.NaN;
        int nulle = 0, kokku = 0;

        for (int i = -Piir * 100; i <= Piir * 100; i++)
        {
            double x = i / 100.0;
            double y = g(x);
            if (!double.IsNaN(y))
            {
                kokku++;
                if (Math.Abs(y) < Eps)
                {
                    leitud.Add(x);
                    nulle++;
                }
                else if (!double.IsNaN(eelmY) && Math.Abs(eelmY) >= Eps && Math.Sign(y) != Math.Sign(eelmY))
                {
                    double r = Poolitamine(g, eelmX, x);
                    if (!double.IsNaN(r) && Math.Abs(g(r)) < 1e-6) leitud.Add(r);
                }
            }
            eelmX = x;
            eelmY = y;
        }

        if (kokku > 0 && nulle == kokku) return null;

        leitud.Sort();
        var tulemus = new List<double>();
        foreach (var v in leitud)
            if (tulemus.Count == 0 || Math.Abs(v - tulemus[^1]) > 1e-6) tulemus.Add(v);
        return tulemus;
    }

    private static double Poolitamine(Func<double, double> g, double a, double b)
    {
        double ga = g(a);
        for (int k = 0; k < 100; k++)
        {
            double m = (a + b) / 2, gm = g(m);
            if (double.IsNaN(gm)) return double.NaN;
            if (Math.Sign(gm) == Math.Sign(ga)) { a = m; ga = gm; }
            else b = m;
        }
        return (a + b) / 2;
    }

    // Kas g on polünoom (aste ≤ 8)? Tagastab täpsed murdkordajad või null.
    private static Murd[]? LeiaPolunoom(Func<double, double> g)
    {
        const int N = 9;
        var xs = new double[N];
        var ys = new double[N];
        bool leitud = false;
        // sõlmpunktid: kõigepealt ümber nulli, siis ainult positiivsed / negatiivsed (nt ln(x) korral)
        foreach (var (algus, samm) in new[] { (-2.187, 0.55), (0.31, 0.5), (-0.31, -0.5) })
        {
            bool korras = true;
            for (int i = 0; i < N && korras; i++)
            {
                xs[i] = algus + samm * i;
                ys[i] = g(xs[i]);
                if (double.IsNaN(ys[i]) || Math.Abs(ys[i]) > 1e12) korras = false;
            }
            if (korras) { leitud = true; break; }
        }
        if (!leitud) return null;

        // Vandermonde'i süsteem (Gauss)
        var A = new double[N, N + 1];
        for (int i = 0; i < N; i++)
        {
            for (int j = 0; j < N; j++) A[i, j] = Math.Pow(xs[i], j);
            A[i, N] = ys[i];
        }
        for (int c = 0; c < N; c++)
        {
            int piv = c;
            for (int r = c + 1; r < N; r++) if (Math.Abs(A[r, c]) > Math.Abs(A[piv, c])) piv = r;
            for (int j = 0; j <= N; j++) (A[c, j], A[piv, j]) = (A[piv, j], A[c, j]);
            for (int r = 0; r < N; r++)
            {
                if (r == c) continue;
                double t = A[r, c] / A[c, c];
                for (int j = c; j <= N; j++) A[r, j] -= t * A[c, j];
            }
        }
        var koef = new double[N];
        for (int i = 0; i < N; i++) koef[i] = A[i, N] / A[i, i];

        double skaala = Math.Max(1, koef.Max(Math.Abs));
        var m = new Murd[N];
        for (int j = 0; j < N; j++)
        {
            if (Math.Abs(koef[j]) < 1e-7 * skaala) { m[j] = new Murd(0); continue; }
            var murd = Murd.FromDouble(koef[j]);
            if (murd == null) return null;
            m[j] = murd.Value;
        }

        int kontrolle = 0;
        foreach (var t in new[] { 0.37, -1.71, 2.93, -3.3, 1.13, 4.1, 5.7, 0.83, -0.77 })
        {
            double gt = g(t);
            if (double.IsNaN(gt)) continue;
            kontrolle++;
            if (Math.Abs(gt - VaartusD(m, t)) > 1e-6 * Math.Max(1, Math.Abs(gt))) return null;
        }
        return kontrolle >= 3 ? Trim(m) : null;
    }

    private static Murd[] Trim(Murd[] a)
    {
        int n = a.Length;
        while (n > 1 && a[n - 1].IsZero) n--;
        return a.Take(n).ToArray();
    }

    private static Murd Vaartus(Murd[] a, Murd x)
    {
        var s = new Murd(0);
        for (int i = a.Length - 1; i >= 0; i--) s = s * x + a[i];
        return s;
    }

    private static double VaartusD(Murd[] a, double x)
    {
        double s = 0;
        for (int i = a.Length - 1; i >= 0; i--) s = s * x + a[i].D;
        return s;
    }

    private static Murd[] Horner(Murd[] a, Murd r)
    {
        int n = a.Length - 1;
        var q = new Murd[n];
        var c = a[n];
        for (int i = n - 1; i >= 0; i--)
        {
            q[i] = c;
            c = a[i] + c * r;
        }
        return q;
    }

    private static (Murd[] b, Murd tegur) Taisarvuliseks(Murd[] a)
    {
        long l = 1;
        foreach (var c in a) if (!c.IsZero) l = l / Murd.Syt(l, c.Q) * c.Q;
        long g = 0;
        foreach (var c in a) if (!c.IsZero) g = Murd.Syt(g, Math.Abs(c.P * (l / c.Q)));
        if (g == 0) g = 1;
        long mark = a[^1].P < 0 ? -1 : 1;
        var tegur = new Murd(mark * l, g);
        return (a.Select(c => c * tegur).ToArray(), tegur);
    }

    private static IEnumerable<long> Jagajad(long n)
    {
        if (n == 0) { yield return 1; yield break; }
        for (long d = 1; d <= n; d++) if (n % d == 0) yield return d;
    }

    private static (long k, long m) JuureLihtsustus(long n)
    {
        long k = 1, m = n;
        for (long t = 2; t * t <= m; t++)
            while (m % (t * t) == 0) { m /= t * t; k *= t; }
        return (k, m);
    }

    // (nb ± k√m) / den lihtsustatud kujul
    private static string JuureVorm(long nb, long k, long m, long den, int mark)
    {
        long g = Murd.Syt(Murd.Syt(Math.Abs(nb), k), Math.Abs(den));
        if (g == 0) g = 1;
        nb /= g; k /= g; den /= g;
        if (den < 0) { den = -den; nb = -nb; mark = -mark; }
        string juur = (k == 1 ? "" : k.ToString(K)) + "√" + m.ToString(K);
        string lugeja = nb == 0 ? (mark < 0 ? "−" : "") + juur : $"{nb} {(mark < 0 ? "−" : "+")} {juur}";
        if (den == 1) return lugeja;
        return nb == 0 ? $"{lugeja}/{den}" : $"({lugeja})/{den}";
    }

    private static string JuurTekst(Murd t)
    {
        // √(p/q) = √(p·q)/q
        var (k, m) = JuureLihtsustus(t.P * t.Q);
        var kord = new Murd(k, t.Q);
        if (m == 1) return kord.ToString();
        string kordaja = kord.P == 1 ? "" : kord.P.ToString(K);
        return kordaja + "√" + m.ToString(K) + (kord.Q == 1 ? "" : "/" + kord.Q.ToString(K));
    }

    // ================= ABIMEETODID: tekst =================

    private static string PolyInfix(Murd[] a, string v)
    {
        var sb = new StringBuilder();
        for (int k = a.Length - 1; k >= 0; k--)
        {
            var c = a[k];
            if (c.IsZero) continue;
            bool neg = c.P < 0;
            var abs = neg ? -c : c;
            string kord = abs.Q == 1 ? abs.P.ToString(K) : $"{abs.P}/{abs.Q}";
            string liige = k == 0 ? kord
                : (abs.P == 1 && abs.Q == 1 ? "" : kord + "*") + (k == 1 ? v : $"{v}^{k}");
            if (sb.Length == 0) sb.Append(neg ? "-" + liige : liige);
            else sb.Append(neg ? " - " : " + ").Append(liige);
        }
        return sb.Length == 0 ? "0" : sb.ToString();
    }

    // Liige loetaval kujul, nt 3x², -6x, 1/3x³
    private static string Liige(Murd c, int k, bool ilus, string v = "x")
    {
        if (c.IsZero) return "0";
        string kord = c.ToString();
        if (k == 0) return kord;
        string muutuja = ilus ? v + Sup(k) : (k == 1 ? v : $"{v}^{k}");
        if (c.P == 1 && c.Q == 1) return muutuja;
        if (c.P == -1 && c.Q == 1) return "-" + muutuja;
        if (ilus && c.Q != 1)
            return (c.P == 1 ? "" : c.P == -1 ? "-" : c.P.ToString(K)) + muutuja + "/" + c.Q.ToString(K);
        return ilus ? kord + muutuja : kord + "*" + muutuja;
    }

    private static string Hulk(string vahemikud) => vahemikud == Pole ? L("таких промежутков нет", "selliseid vahemikke pole") : "x ∈ " + vahemikud;

    private static string Kumm(double v) => (Math.Round(v, 4) == 0 ? 0 : Math.Round(v, 4)).ToString("0.####", K);

    private static string Mono(int k, string v) => k == 1 ? v : $"{v}^{k}";

    private static string Lin(Murd r, string v) => r.P < 0 ? $"{v} + {(-r)}" : $"{v} - {r}";

    private static string Sulg(long n) => n < 0 ? $"({n})" : n.ToString(K);

    private static string Sup(int k)
    {
        if (k == 1) return "";
        const string yla = "⁰¹²³⁴⁵⁶⁷⁸⁹";
        return string.Concat(k.ToString(K).Select(ch => yla[ch - '0']));
    }

    // Sulgudes rühm alates indeksist i (s[i] == '(')
    private static string? Rühm(string s, int i)
    {
        int d = 0;
        for (int j = i; j < s.Length; j++)
        {
            if (s[j] == '(') d++;
            else if (s[j] == ')') { d--; if (d == 0) return s.Substring(i + 1, j - i - 1); }
        }
        return null;
    }

    // Nimetajad, mis sisaldavad x-i
    private static List<string> Nimetajad(string valem)
    {
        var v = valem.Replace(" ", "");
        var tulemus = new List<string>();
        for (int i = 0; i < v.Length; i++)
        {
            if (v[i] != '/') continue;
            if (i + 1 < v.Length && v[i + 1] == '(')
            {
                var g = Rühm(v, i + 1);
                if (g != null && g.Contains('x')) tulemus.Add(g);
            }
            else if (i + 1 < v.Length && v[i + 1] == 'x') tulemus.Add("x");
        }
        return tulemus.Distinct().ToList();
    }

    private static List<string> FunktsiooniArgumendid(string valem, string nimi)
    {
        var v = valem.Replace(" ", "");
        var tulemus = new List<string>();
        foreach (Match m in Regex.Matches(v, @"\b" + nimi + @"\("))
        {
            var g = Rühm(v, m.Index + nimi.Length);
            if (g != null && g.Contains('x')) tulemus.Add(g);
        }
        return tulemus.Distinct().ToList();
    }

    // (...)^(1/2) alused
    private static List<string> JuureAlused(string valem)
    {
        var v = valem.Replace(" ", "");
        var tulemus = new List<string>();
        int i = 0;
        while ((i = v.IndexOf(")^(1/2)", i, StringComparison.Ordinal)) >= 0)
        {
            int d = 0;
            for (int j = i; j >= 0; j--)
            {
                if (v[j] == ')') d++;
                else if (v[j] == '(') { d--; if (d == 0) { var g = v.Substring(j + 1, i - j - 1); if (g.Contains('x')) tulemus.Add(g); break; } }
            }
            i++;
        }
        return tulemus.Distinct().ToList();
    }

    // ================= MÄÄRAMISPIIRKOND JA MÄRGID =================

    private static List<Vahemik> LeiaMaaramispiirkond(Func<double, double> f)
    {
        int n = Piir * 100;
        var tulemus = new List<Vahemik>();
        int? algus = null;

        for (int i = -n; i <= n + 1; i++)
        {
            bool maaratud = i <= n && !double.IsNaN(f(i / 100.0));
            if (maaratud && algus == null) algus = i;
            else if (!maaratud && algus != null)
            {
                int a = algus.Value, b = i - 1;
                double A = a == -n ? double.NegativeInfinity : LeiaPiir(f, (a - 1) / 100.0, a / 100.0);
                double B = b == n ? double.PositiveInfinity : LeiaPiir(f, (b + 1) / 100.0, b / 100.0);
                bool aK = !double.IsInfinity(A) && !double.IsNaN(f(A));
                bool bK = !double.IsInfinity(B) && !double.IsNaN(f(B));
                tulemus.Add(new Vahemik(A, B, aK, bK));
                algus = null;
            }
        }
        return tulemus;
    }

    private static double LeiaPiir(Func<double, double> f, double u, double m)
    {
        for (int k = 0; k < 60; k++)
        {
            double c = (u + m) / 2;
            if (double.IsNaN(f(c))) u = c; else m = c;
        }
        double r = Math.Round(m, 4);
        return r == 0 ? 0 : r;
    }

    private static string MpTekst(List<Vahemik> v)
    {
        if (v.Count == 0) return "∅";

        bool ainultPunktid = double.IsNegativeInfinity(v[0].A) && double.IsPositiveInfinity(v[^1].B);
        for (int i = 1; i < v.Count && ainultPunktid; i++)
            if (v[i - 1].B != v[i].A || v[i - 1].BKaasa || v[i].AKaasa) ainultPunktid = false;

        if (ainultPunktid)
            return v.Count == 1
                ? "(-∞; ∞)"
                : "R \\ {" + string.Join("; ", v.Skip(1).Select(x => Arv(x.A))) + "}";

        return string.Join(" ∪ ", v.Select(x => VahemikTekst(x.A, x.B, x.AKaasa, x.BKaasa)));
    }

    private static string VahemikTekst(double a, double b, bool aK, bool bK) =>
        (aK ? "[" : "(") + Arv(a) + "; " + Arv(b) + (bK ? "]" : ")");

    // Vahemikud, kus g > 0 ja g < 0, koos proovipunktidega
    private static (string pos, string neg, List<string> read) MargiVahemikud(
        Func<double, double> g, List<double> nullid, List<Vahemik> mp, string nimi, string posSona, string negSona)
    {
        var pos = new List<string>();
        var neg = new List<string>();
        var read = new List<string>();

        foreach (var v in mp)
        {
            var piirid = new List<double> { v.A };
            piirid.AddRange(nullid.Where(z => z > v.A && z < v.B));
            piirid.Add(v.B);

            for (int i = 0; i < piirid.Count - 1; i++)
            {
                double a = piirid[i], b = piirid[i + 1];
                double t = Proovipunkt(a, b);
                double m = g(t);
                if (double.IsNaN(m) || Math.Abs(m) < Eps) continue;
                string vahemik = VahemikTekst(a, b, false, false);
                (m > 0 ? pos : neg).Add(vahemik);
                read.Add($"x ∈ {vahemik}: {L("пробная точка", "proovipunkt")} x = {Arv(t)}, {nimi}({Arv(t)}) = {Arv(m)} {(m > 0 ? "> 0" : "< 0")} ⇒ {(m > 0 ? posSona : negSona)}");
            }
        }

        return (pos.Count == 0 ? Pole : string.Join(" ∪ ", pos),
                neg.Count == 0 ? Pole : string.Join(" ∪ ", neg),
                read);
    }

    // Võimalikult lihtne (täisarvuline) proovipunkt vahemikus (a; b)
    private static double Proovipunkt(double a, double b)
    {
        if (double.IsNegativeInfinity(a) && double.IsPositiveInfinity(b)) return 0;
        if (double.IsNegativeInfinity(a)) return Math.Ceiling(b) - 1;
        if (double.IsPositiveInfinity(b)) return Math.Floor(a) + 1;
        double t = Math.Floor(a) + 1;
        if (t < b) return (a < 0 && b > 0) ? 0 : t;
        return (a + b) / 2;
    }

    private static string Loetelu(List<double> vaartused) =>
        string.Join(", ", vaartused.Select((v, i) => $"x{i + 1} = {Arv(v)}"));

    // Arv ilusti: täisarv, murd (4/3), juur (√3, √3/3) või 4 komakohta
    private static string Arv(double v)
    {
        if (double.IsPositiveInfinity(v)) return "∞";
        if (double.IsNegativeInfinity(v)) return "-∞";

        double r = Math.Round(v);
        if (Math.Abs(v - r) < 1e-9) return (r == 0 ? 0 : r).ToString("0", K);

        for (int q = 2; q <= 12; q++)
        {
            double p = Math.Round(v * q);
            if (Math.Abs(v - p / q) < 1e-9) return $"{p.ToString("0", K)}/{q}";
        }

        double r2 = v * v;
        for (int q = 1; q <= 12; q++)
        {
            double p = Math.Round(r2 * q);
            if (p <= 0 || Math.Abs(r2 - p / q) > 1e-7) continue;
            long n = (long)p * q, k = 1, jaak = n;
            for (long t = 2; t * t <= jaak; t++)
                while (jaak % (t * t) == 0) { jaak /= t * t; k *= t; }
            if (jaak == 1) break;
            long jag = q, g = Murd.Syt(k, jag);
            k /= g; jag /= g;
            return (v < 0 ? "-" : "") + (k == 1 ? "" : k.ToString(K)) + "√" + jaak.ToString(K) + (jag == 1 ? "" : "/" + jag.ToString(K));
        }

        double m = Math.Round(v, 4);
        return (m == 0 ? 0 : m).ToString("0.####", K);
    }
}

// Täpne murdarv p/q
public readonly struct Murd : IEquatable<Murd>
{
    public readonly long P, Q;

    public Murd(long p, long q = 1)
    {
        if (q < 0) { p = -p; q = -q; }
        long g = Syt(Math.Abs(p), q);
        if (g == 0) g = 1;
        P = p / g;
        Q = q / g;
        if (Q == 0) Q = 1;
    }

    public static long Syt(long a, long b) => b == 0 ? Math.Abs(a) : Syt(b, a % b);

    public bool IsZero => P == 0;
    public double D => (double)P / Q;

    public static Murd operator +(Murd a, Murd b) => new(a.P * b.Q + b.P * a.Q, a.Q * b.Q);
    public static Murd operator -(Murd a, Murd b) => new(a.P * b.Q - b.P * a.Q, a.Q * b.Q);
    public static Murd operator -(Murd a) => new(-a.P, a.Q);
    public static Murd operator *(Murd a, Murd b) => new(a.P * b.P, a.Q * b.Q);
    public static Murd operator /(Murd a, Murd b) => new(a.P * b.Q, a.Q * b.P);

    public static Murd? FromDouble(double v)
    {
        for (long q = 1; q <= 1000; q++)
        {
            double p = Math.Round(v * q);
            if (Math.Abs(v * q - p) < 1e-6 * Math.Max(1, Math.Abs(v * q)) && Math.Abs(p) < 1e12)
                return new Murd((long)p, q);
        }
        return null;
    }

    public bool Equals(Murd o) => P == o.P && Q == o.Q;
    public override bool Equals(object? o) => o is Murd m && Equals(m);
    public override int GetHashCode() => HashCode.Combine(P, Q);
    public override string ToString() => Q == 1 ? P.ToString(CultureInfo.InvariantCulture) : $"{P}/{Q}";
}
