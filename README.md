# Funktsioonide uurimine

Veebirakendus **ASP.NET Core MVC (.NET 8)** baasil, mis uurib sisestatud valemi järgi funktsiooni `f(x)`: leiab tuletised, nullkohad, ekstreemumid, kasvamis- ja kahanemisvahemikud, kumerus- ja nõgususvahemikud, käänupunktid, joonistab graafiku, puutuja ja normaali ning näitab üksikasjalikku lahenduskäiku. Tulemusi saab salvestada SQLite andmebaasi.

Kasutajaliides on kahes keeles: **eesti** ja **vene**.

## Võimalused

- Valemi sisestamine, nt `x^3 - 3*x`, `x^2 - 4*x + 3`, `sin(x)`, `ln(x)`, `exp(x)`
- Funktsiooni automaatne analüüs:
  - määramispiirkond D(f)
  - esimene ja teine tuletis
  - nullkohad ja lõikepunkt y-teljega
  - kriitilised punktid ja ekstreemumid (max / min)
  - kasvamis- ja kahanemisvahemikud
  - kumerus- ja nõgususvahemikud, käänupunktid
  - positiivsus- ja negatiivsuspiirkonnad
- Samm-sammuline lahenduskäik ilusti vormistatud valemitega (KaTeX)
- Interaktiivne graafik (Chart.js), millel on märgitud erilised punktid
- Puutuja ja normaal punktis `x0`, funktsiooni väärtus punktis `a`
- CRUD: uurimuste salvestamine, vaatamine, muutmine ja kustutamine (EF Core + SQLite)
- Keele vahetamine ET / RU (valik salvestatakse küpsisesse)
- Juhendi leht (`Juhend`)

## Tehnoloogiad

| Osa | Mida kasutatakse |
|---|---|
| Backend | ASP.NET Core MVC, .NET 8 |
| Andmebaas | SQLite, Entity Framework Core 8 |
| Matemaatika | MathNet.Symbolics (valemi parsimine, tuletised) |
| Frontend | Bootstrap 5, Chart.js, KaTeX, math.js, MathLive (laaditakse CDN-ist) |

## Nõuded

- [.NET SDK 8.0](https://dotnet.microsoft.com/download/dotnet/8.0) või uuem
  (projektis on `RollForward=Major`, seega käivitub ka .NET 9 / 10 peal)
- Brauseris internetiühendus — Bootstrap, Chart.js, KaTeX jt teegid laaditakse CDN-ist

Kontrolli, kas .NET on paigaldatud:

```bash
dotnet --version
```

## Käivitamine

### Käsurealt

```bash
# 1. Klooni repositoorium
git clone https://github.com/AnastasiiaRadasheva/Funktsioonid-tulemused-.git
cd Funktsioonid-tulemused-

# 2. Taasta paketid
dotnet restore

# 3. Käivita
dotnet run
```

Pärast käivitamist ava brauseris: **http://localhost:5080**

Rakenduse peatamiseks vajuta terminalis `Ctrl + C`.

### Visual Studios

1. Ava fail `FunktsioonideUurimine.sln`
2. Vali käivitusprofiil **http**
3. Vajuta **F5** (või nuppu ▶) — brauser avaneb ise

### Visual Studio Code'is / Rideris

Ava projekti kaust ja käivita sisseehitatud terminalis `dotnet run` või kasuta IDE käivitusnuppu.

## Andmebaas

Midagi käsitsi seadistama ei pea. Esimesel käivitamisel rakendus ise:

1. loob projekti kausta faili `funktsioonid.db`;
2. rakendab migratsioonid (`Database.Migrate()`);
3. lisab kolm näidet: `x^3 - 3*x`, `x^2 - 4*x + 3`, `x^3 - 12*x`.

Ühendusstring asub failis `appsettings.json`:

```json
"ConnectionStrings": {
  "Vaikimisi": "Data Source=funktsioonid.db"
}
```

**Andmebaasi lähtestamiseks** peata rakendus ja kustuta fail `funktsioonid.db` — järgmisel käivitamisel luuakse see uuesti.

Kui muudad mudelit ja vajad uut migratsiooni:

```bash
dotnet tool install --global dotnet-ef   # ühe korra
dotnet ef migrations add MigratsiooniNimi
dotnet ef database update
```

## Kasutamine

1. Sisesta avalehel funktsiooni valem.
2. Vajuta analüüsi nuppu — ilmuvad tulemused, lahenduskäik ja graafik.
3. Soovi korral sisesta `x0`, et saada puutuja ja normaal, või `a`, et arvutada `f(a)`.
4. Salvesta uurimus — see ilmub loendisse **Funktsioonid**, kus saab seda avada, muuta või kustutada.
5. Keelt saab vahetada menüüs nuppudega ET / RU.

### Valemi kirjutamise reeglid

| Mis | Kuidas kirjutada | Näide |
|---|---|---|
| Aste | `^` (või `**`) | `x^3` |
| Korrutamine | `*` (võib ära jätta: `2x`, `x(x+1)`) | `3*x`, `2x` |
| Jagamine | `/` | `1/x` |
| Funktsioonid | `sin`, `cos`, `exp`, `ln` | `sin(x)`, `ln(x)` |
| Kümnendmurd | punkt või koma | `0.5`, `0,5` |

Lubatud on ainult numbrid, `x`, tehtemärgid `+ - * / ^`, sulud ja funktsioonide nimed. Määramispiirkonna võib sisestada käsitsi (valikuline väli), muidu arvutatakse see automaatselt. Punkte otsitakse vahemikust `[-20; 20]`.

## Projekti struktuur

```
├── Controllers/
│   ├── HomeController.cs           # avaleht, analüüs, puutuja, väärtus, keele vahetus
│   └── FunktsioonidController.cs   # salvestatud uurimuste CRUD + graafiku andmed
├── Models/
│   ├── FunktsiooniUurimine.cs      # andmebaasi olem (analüüsi tulemused)
│   └── FunktsiooniVorm.cs          # sisestusvorm (valem + määramispiirkond)
├── Services/
│   ├── FunktsiooniAnaluusija.cs    # kogu matemaatika: tuletised, nullkohad, ekstreemumid jne
│   └── Tolge.cs                    # kasutajaliidese tõlge ET / RU
├── Data/
│   └── RakenduseKontekst.cs        # DbContext (EF Core)
├── Migrations/                     # andmebaasi migratsioonid
├── Views/                          # Razor-vaated (Home, Funktsioonid, Shared)
├── wwwroot/
│   ├── css/sait.css
│   └── js/                         # graafik, valemi sisestus, arvutused kliendi poolel
├── Program.cs                      # rakenduse seadistus, migratsioonid, näidisandmed
├── appsettings.json                # SQLite ühendusstring
└── FunktsioonideUurimine.sln
```

## Peamised aadressid

| Aadress | Mis avaneb |
|---|---|
| `/` | Avaleht — funktsiooni analüüs |
| `/Home/Juhend` | Juhend |
| `/Funktsioonid` | Salvestatud uurimuste loend |
| `/Funktsioonid/Create` | Uus uurimus |
| `/Funktsioonid/Details/{id}` | Uurimuse üksikasjad |
| `/Funktsioonid/Edit/{id}` | Muutmine |
| `/Funktsioonid/Delete/{id}` | Kustutamine |

## Võimalikud probleemid

- **`dotnet` ei leitud** — paigalda .NET SDK ja käivita terminal uuesti.
- **Port 5080 on hõivatud** — käivita teisel pordil:
  `dotnet run --urls http://localhost:5100`
- **Graafik puudub / valemid kuvatakse tekstina** — kontrolli internetiühendust: JS-teegid laaditakse CDN-ist.
- **Andmebaasi viga pärast mudeli muutmist** — kustuta `funktsioonid.db` ja käivita uuesti.

## Autor

Anastasiia Radasheva