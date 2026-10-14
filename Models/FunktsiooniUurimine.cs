using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using FunktsioonideUurimine.Services;

namespace FunktsioonideUurimine.Models;

public class FunktsiooniUurimine
{
    public int Id { get; set; }

    [Required, MaxLength(200)]
    public string Valem { get; set; } = string.Empty;

    [MaxLength(200)]
    public string Maaramispiirkond { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Tuletis { get; set; } = string.Empty;

    [MaxLength(500)]
    public string TeineTuletis { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Nullkohad { get; set; } = string.Empty;

    [MaxLength(500)]
    public string KriitilisedPunktid { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Ekstreemumid { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Kasvamisvahemikud { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Kahanemisvahemikud { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Kumerusvahemikud { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Nogususvahemikud { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Kaanupunktid { get; set; } = string.Empty;

    public string Lahendus { get; set; } = string.Empty;   // lahenduskäik (JSON)

    public DateTime LuodudAeg { get; set; } = DateTime.UtcNow;

    // Arvutatakse iga kord uuesti, andmebaasi ei salvestata
    [NotMapped] public string YLoikepunkt { get; set; } = string.Empty;
    [NotMapped] public string Positiivsus { get; set; } = string.Empty;
    [NotMapped] public string Negatiivsus { get; set; } = string.Empty;
    [NotMapped] public List<LahenduseSamm> Sammud { get; set; } = new();
    [NotMapped] public List<GraafikuMark> Margid { get; set; } = new();
}
