using FunktsioonideUurimine.Data;
using FunktsioonideUurimine.Models;
using FunktsioonideUurimine.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();

// DbContext registreerimine (SQLite)
builder.Services.AddDbContext<RakenduseKontekst>(valikud =>
    valikud.UseSqlite(builder.Configuration.GetConnectionString("Vaikimisi")));

builder.Services.AddSingleton<FunktsiooniAnaluusija>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<Tolge>();

var app = builder.Build();

// Rakendab migratsioonid ja lisab näidisandmed, kui andmebaas on tühi
using (var ulatus = app.Services.CreateScope())
{
    var kontekst = ulatus.ServiceProvider.GetRequiredService<RakenduseKontekst>();
    var analuusija = ulatus.ServiceProvider.GetRequiredService<FunktsiooniAnaluusija>();

    kontekst.Database.Migrate();

    if (!kontekst.FunktsiooniUurimised.Any())
    {
        foreach (var valem in new[] { "x^3 - 3*x", "x^2 - 4*x + 3", "x^3 - 12*x" })
        {
            var olem = new FunktsiooniUurimine { Valem = valem };
            analuusija.Taida(olem, null);
            kontekst.FunktsiooniUurimised.Add(olem);
        }
        kontekst.SaveChanges();
    }

    // Uuendab salvestatud analüüsid, et need vastaksid analüsaatori praegusele versioonile
    foreach (var olem in kontekst.FunktsiooniUurimised.ToList())
    {
        try { analuusija.Taida(olem, FunktsiooniAnaluusija.KasutajaMaaramispiirkond(olem.Maaramispiirkond)); }
        catch { /* vigase valemiga kirje jääb muutmata */ }
    }
    kontekst.SaveChanges();
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Index");
}

app.UseStaticFiles();
app.UseRouting();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
