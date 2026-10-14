using System.ComponentModel.DataAnnotations;

namespace FunktsioonideUurimine.Models;

// Vorm, mida kasutaja täidab (ülejäänud väljad arvutab server ise)
public class FunktsiooniVorm
{
    public int Id { get; set; }

    [Display(Name = "Valem f(x)")]
    [Required(ErrorMessage = "Sisesta valem.")]
    [StringLength(200, ErrorMessage = "Valem võib olla kuni 200 märki.")]
    [RegularExpression(@"^[0-9a-z\s\+\-\*/\^\(\)\.,]+$",
        ErrorMessage = "Lubatud on numbrid, x, tehtemärgid + - * / ^, sulud ja funktsioonid (sin, cos, exp, ln).")]
    public string Valem { get; set; } = string.Empty;

    [Display(Name = "Määramispiirkond (valikuline)")]
    [StringLength(200, ErrorMessage = "Kuni 200 märki.")]
    public string? Maaramispiirkond { get; set; }
}
