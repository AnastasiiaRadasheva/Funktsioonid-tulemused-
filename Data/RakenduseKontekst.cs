using FunktsioonideUurimine.Models;
using Microsoft.EntityFrameworkCore;

namespace FunktsioonideUurimine.Data;

public class RakenduseKontekst : DbContext
{
    public RakenduseKontekst(DbContextOptions<RakenduseKontekst> valikud) : base(valikud) { }

    public DbSet<FunktsiooniUurimine> FunktsiooniUurimised => Set<FunktsiooniUurimine>();

    protected override void OnModelCreating(ModelBuilder mudel)
    {
        mudel.Entity<FunktsiooniUurimine>().ToTable("FunktsiooniUurimised");
    }
}
