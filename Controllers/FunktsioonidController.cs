using FunktsioonideUurimine.Data;
using FunktsioonideUurimine.Models;
using FunktsioonideUurimine.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FunktsioonideUurimine.Controllers;

public class FunktsioonidController : Controller
{

    private readonly RakenduseKontekst _kontekst;
    
    private readonly FunktsiooniAnaluusija _analuusija;
    
    
    private readonly Tolge _t;

    public FunktsioonidController(RakenduseKontekst kontekst, FunktsiooniAnaluusija analuusija, Tolge t)
    {
        _kontekst = kontekst;
        _analuusija = analuusija;
        _t = t;
    }

    // READ: nimekiri
    public async Task<IActionResult> Index()
    {
        var funktsioonid = await _kontekst.FunktsiooniUurimised
            .OrderByDescending(f => f.LuodudAeg)
            .ToListAsync();
        return View(funktsioonid);
    }

    // READ: detailvaade + graafik + lahenduskäik
    public async Task<IActionResult> Details(int? id)
    {
        if (id == null) return NotFound();
        var olem = await _kontekst.FunktsiooniUurimised.AsNoTracking().FirstOrDefaultAsync(f => f.Id == id);
        if (olem == null) return NotFound();

        // Lahenduskäik arvutatakse näitamiseks uuesti; GET-päring andmebaasi ei muuda
        _analuusija.Taida(olem, FunktsiooniAnaluusija.KasutajaMaaramispiirkond(olem.Maaramispiirkond), _t.Keel);

        return View(olem);
    }

    // CREATE
    public IActionResult Create() => View(new FunktsiooniVorm());

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Create(FunktsiooniVorm vorm)
    {
        Valideeri(vorm);
        if (!ModelState.IsValid) return View(vorm);

        var olem = new FunktsiooniUurimine { Valem = vorm.Valem };
        _analuusija.Taida(olem, vorm.Maaramispiirkond);

        await _kontekst.FunktsiooniUurimised.AddAsync(olem);
        await _kontekst.SaveChangesAsync();

        TempData["Teade"] = _t["Функция исследована и сохранена.", "Funktsioon lahendati ja salvestati."];
        return RedirectToAction(nameof(Details), new { id = olem.Id });
    }

    // UPDATE
    public async Task<IActionResult> Edit(int? id)
    {
        if (id == null) return NotFound();
        var olem = await _kontekst.FunktsiooniUurimised.FindAsync(id);
        if (olem == null) return NotFound();

        // arvutatud määramispiirkond jäetakse tühjaks (leitakse uuesti), kasutaja sisestatud jääb alles
        return View(new FunktsiooniVorm
        {
            Id = olem.Id,
            Valem = olem.Valem,
            Maaramispiirkond = FunktsiooniAnaluusija.KasutajaMaaramispiirkond(olem.Maaramispiirkond)
        });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(int id, FunktsiooniVorm vorm)
    {
        if (id != vorm.Id) return NotFound();
        var olem = await _kontekst.FunktsiooniUurimised.FindAsync(id);
        if (olem == null) return NotFound();

        Valideeri(vorm);
        if (!ModelState.IsValid) return View(vorm);

        olem.Valem = vorm.Valem;
        _analuusija.Taida(olem, vorm.Maaramispiirkond);

        _kontekst.FunktsiooniUurimised.Update(olem);
        await _kontekst.SaveChangesAsync();

        TempData["Teade"] = _t["Изменения сохранены.", "Muudatused salvestati."];
        return RedirectToAction(nameof(Details), new { id });
    }

    // DELETE
    public async Task<IActionResult> Delete(int? id)
    {
        if (id == null) return NotFound();
        var olem = await _kontekst.FunktsiooniUurimised.FirstOrDefaultAsync(f => f.Id == id);
        if (olem == null) return NotFound();
        return View(olem);
    }

    [HttpPost, ActionName("Delete")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteConfirmed(int id)
    {
        var olem = await _kontekst.FunktsiooniUurimised.FindAsync(id);
        if (olem != null)
        {
            _kontekst.FunktsiooniUurimised.Remove(olem);
            await _kontekst.SaveChangesAsync();
            TempData["Teade"] = _t["Функция удалена.", "Funktsioon kustutati."];
        }
        return RedirectToAction(nameof(Index));
    }

    // JSON graafiku jaoks: /Funktsioonid/Punktid/5?min=-5&max=5&samm=0.1
    [HttpGet]
    public async Task<IActionResult> Punktid(int id, double min = -5, double max = 5, double samm = 0.1)
    {
        if (min >= max || samm <= 0 || (max - min) / samm > 5000)
            return BadRequest(_t["Неверный диапазон: x min должен быть меньше x max, шаг > 0, точек не больше 5000.", "Vale vahemik: x min peab olema väiksem kui x max, samm > 0 ja punkte kuni 5000."]);

        var olem = await _kontekst.FunktsiooniUurimised.FindAsync(id);
        if (olem == null) return NotFound();

        return Json(_analuusija.ArvutaPunktid(olem.Valem, min, max, samm));
    }

    // JSON puutuja ja normaali jaoks: /Funktsioonid/Puutuja/5?x0=1
    [HttpGet]
    public async Task<IActionResult> Puutuja(int id, double x0)
    {
        var olem = await _kontekst.FunktsiooniUurimised.FindAsync(id);
        if (olem == null) return NotFound();

        return Json(_analuusija.PuutujaJaNormaal(olem.Valem, x0, _t.Keel));
    }

    // Sisendi valideerimine
    private void Valideeri(FunktsiooniVorm vorm)
    {
        // DataAnnotations-i teated on eesti keeles – vajadusel tõlgime
        foreach (var kirje in ModelState.Values)
        {
            var teated = kirje.Errors.Select(e => _t.Viga(e.ErrorMessage)).ToList();
            kirje.Errors.Clear();
            teated.ForEach(t => kirje.Errors.Add(t));
        }

        if (string.IsNullOrWhiteSpace(vorm.Valem)) return;

        if (!_analuusija.OnKorrektne(vorm.Valem, out var viga, _t.Keel))
            ModelState.AddModelError(nameof(vorm.Valem), viga);
    }
}
