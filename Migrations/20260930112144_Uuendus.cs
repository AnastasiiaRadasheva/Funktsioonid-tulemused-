using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FunktsioonideUurimine.Migrations
{
    /// <inheritdoc />
    public partial class Uuendus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FunktsiooniUurimised",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Valem = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Maaramispiirkond = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Tuletis = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    TeineTuletis = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Nullkohad = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    KriitilisedPunktid = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Ekstreemumid = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Kasvamisvahemikud = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Kahanemisvahemikud = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Kumerusvahemikud = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Nogususvahemikud = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Kaanupunktid = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Lahendus = table.Column<string>(type: "TEXT", nullable: false),
                    LuodudAeg = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FunktsiooniUurimised", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FunktsiooniUurimised");
        }
    }
}
