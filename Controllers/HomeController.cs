using System.Text.RegularExpressions;
using FunktsioonideUurimine.Models;
using FunktsioonideUurimine.Services;
using Microsoft.AspNetCore.Mvc;

namespace FunktsioonideUurimine.Controllers;

// Avaleht (kalkulaator), juhend, keelevalik ja JSON-päringud, mis midagi ei salvesta
public class HomeController : Controller
{
    private static readonly Regex LubatudMargid = new(@"^[0-9a-z\s\+\-\*/\^\(\)\.,]+$");
    private readonly FunktsiooniAnaluusija _analuusija;
    private readonly Tolge _t;

    public HomeController(FunktsiooniAnaluusija analuusija, Tolge t)
    {
        _analuusija = analuusija;
        _t = t;
    }

    // /?valem=x^2-4*x+3&leia=null
    public IActionResult Index(string? valem, string? leia)
    {
        ViewData["Valem"] = valem ?? string.Empty;
        ViewData["Leia"] = leia ?? "koik";
        // lingiga tulles (juhend, jagatud link) kerime kohe graafiku juurde
        ViewData["Kerida"] = !string.IsNullOrWhiteSpace(valem);
        return View();
    }

    public IActionResult Juhend() => View();

    // Keele vahetus: /Home/Keel?keel=ru&tagasi=/Funktsioonid
    public IActionResult Keel(string keel, string? tagasi)
    {
        if (keel is "et" or "ru")
        {
            Response.Cookies.Append(Tolge.Kupsis, keel, new CookieOptions
            {
                Expires = DateTimeOffset.UtcNow.AddYears(1),
                IsEssential = true,
                SameSite = SameSiteMode.Lax
            });
        }
        return Url.IsLocalUrl(tagasi) ? LocalRedirect(tagasi!) : RedirectToAction(nameof(Index));
    }

    // Täielik uurimine: tabeli read koos lahenduskäiguga
    [HttpGet]
    public IActionResult Analuusi(string? valem)
    {
        if (!Kontrolli(valem, out var viga)) return Json(new { viga });

        var olem = new FunktsiooniUurimine { Valem = valem! };
        try
        {
            _analuusija.Taida(olem, null, _t.Keel);
        }
        catch
        {
            return Json(new { viga = _t["Не удалось исследовать эту функцию. Попробуйте записать её проще.",
                                        "Seda funktsiooni ei õnnestunud uurida. Proovi lihtsamat kuju."] });
        }

        var sammud = olem.Sammud;
        object Rida(string voti, string nimi, string vastus, bool onValem, params string[] votmed) => new
        {
            voti,
            nimi,
            vastus,
            onValem,
            sammud = sammud.Where(s => votmed.Contains(s.Voti)).ToList()
        };

        var read = new[]
        {
            Rida("mp", _t["Область определения", "Määramispiirkond"], olem.Maaramispiirkond, false, "mp"),
            Rida("y", _t["Пересечение с осью Oy", "Lõikepunkt y-teljega"], olem.YLoikepunkt, false, "y"),
            Rida("null", _t["Нули функции", "Nullkohad"], olem.Nullkohad, false, "null"),
            // kaheosalised vastused: iga osa eraldi real kujul "tähis: väärtus" (tähise selgituse lisab leht)
            Rida("marg", _t["Знакопостоянство", "Positiivsus ja negatiivsus"],
                $"X⁺: {Hulk(olem.Positiivsus)}\nX⁻: {Hulk(olem.Negatiivsus)}", false, "null", "marg"),
            Rida("t1", _t["Производная f'(x)", "Tuletis f'(x)"], olem.Tuletis, true, "t1"),
            Rida("kp", _t["Критические точки", "Kriitilised punktid"], olem.KriitilisedPunktid, false, "t1", "kp", "mono"),
            Rida("mon", _t["Возрастание и убывание", "Kasvamine ja kahanemine"],
                $"X↑: {Hulk(olem.Kasvamisvahemikud)}\nX↓: {Hulk(olem.Kahanemisvahemikud)}", false, "t1", "kp", "mon", "mono"),
            Rida("ekst", _t["Экстремумы", "Ekstreemumid"], olem.Ekstreemumid, false, "t1", "kp", "mon", "mono", "ekst"),
            Rida("t2", _t["Вторая производная f''(x)", "Teine tuletis f''(x)"], olem.TeineTuletis, true, "t1", "t2"),
            Rida("kum", _t["Выпуклость и вогнутость", "Kumerus ja nõgusus"],
                $"∩: {Hulk(olem.Kumerusvahemikud)}\n∪: {Hulk(olem.Nogususvahemikud)}", false, "t1", "t2", "t2n", "kum"),
            Rida("kaanu", _t["Точки перегиба", "Käänupunktid"], olem.Kaanupunktid, false, "t1", "t2", "t2n", "kum", "kaanu"),
        };

        var margid = olem.Margid.Where(m => double.IsFinite(m.X) && double.IsFinite(m.Y)).ToList();
        return Json(new { valem = olem.Valem, read, margid, sammud });
    }

    [HttpGet]
    public IActionResult Puutuja(string? valem, double x0)
    {
        if (!Kontrolli(valem, out var viga)) return Json(new { korras = false, viga });
        return Json(_analuusija.PuutujaJaNormaal(valem!, x0, _t.Keel));
    }

    [HttpGet]
    public IActionResult Vaartus(string? valem, double a)
    {
        if (!Kontrolli(valem, out var viga)) return Json(new { korras = false, viga });
        return Json(_analuusija.Vaartus(valem!, a, _t.Keel));
    }

    private bool Kontrolli(string? valem, out string viga)
    {
        viga = string.Empty;
        if (string.IsNullOrWhiteSpace(valem)) { viga = _t["Введите функцию.", "Sisesta funktsioon."]; return false; }
        if (valem.Length > 200) { viga = _t["Формула слишком длинная (до 200 символов).", "Valem on liiga pikk (kuni 200 märki)."]; return false; }
        if (!LubatudMargid.IsMatch(valem))
        {
            viga = _t["Можно использовать цифры, x, знаки + − · / ^, скобки и функции sin, cos, tan, ln, eˣ, √.",
                      "Lubatud on numbrid, x, tehtemärgid + − · / ^, sulud ja funktsioonid sin, cos, tan, ln, eˣ, √."];
            return false;
        }
        return _analuusija.OnKorrektne(valem, out viga, _t.Keel);
    }

    private string Hulk(string vahemikud) => vahemikud is "нет" or "puuduvad" ? _t["нет", "pole"] : vahemikud;
}
