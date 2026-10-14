namespace FunktsioonideUurimine.Services;

// Kasutajaliidese keel: "et" (eesti) või "ru" (vene).
// Valik hoitakse küpsises; kui seda pole, vaadatakse brauseri keelt.
public class Tolge
{
    public const string Kupsis = "keel";
    private readonly IHttpContextAccessor _http;

    public Tolge(IHttpContextAccessor http)
    {
        _http = http;
    }

    public string Keel
    {
        get
        {
            var paring = _http.HttpContext?.Request;
            if (paring == null) return "et";
            var valitud = paring.Cookies[Kupsis];
            if (valitud is "et" or "ru") return valitud;
            return paring.Headers.AcceptLanguage.ToString().TrimStart().StartsWith("ru", StringComparison.OrdinalIgnoreCase) ? "ru" : "et";
        }
    }

    public bool OnVene => Keel == "ru";

    // @T["русский", "eesti"]
    public string this[string ru, string et] => OnVene ? ru : et;

    // Andmebaasi on analüüs salvestatud eesti keeles – venekeelses vaates tõlgime tüüpilised fraasid
    public string Andmed(string? tekst)
    {
        if (string.IsNullOrEmpty(tekst) || !OnVene) return tekst ?? string.Empty;
        return tekst
            .Replace("Puuduvad", "Нет")
            .Replace("puuduvad", "нет")
            .Replace("Puudub", "Нет")
            .Replace("iga x korral", "при любом x");
    }

    // DataAnnotations-i veateated on eesti keeles; venekeelses vaates tõlgime need
    private static readonly Dictionary<string, string> VeaTeated = new()
    {
        ["Sisesta valem."] = "Введите формулу.",
        ["Valem võib olla kuni 200 märki."] = "Формула может быть до 200 символов.",
        ["Lubatud on numbrid, x, tehtemärgid + - * / ^, sulud ja funktsioonid (sin, cos, exp, ln)."] =
            "Можно использовать цифры, x, знаки + - * / ^, скобки и функции (sin, cos, exp, ln).",
        ["Kuni 200 märki."] = "До 200 символов."
    };

    public string Viga(string teade) => OnVene && VeaTeated.TryGetValue(teade, out var ru) ? ru : teade;
}
