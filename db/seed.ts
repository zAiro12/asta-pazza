import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
import { config } from 'dotenv';

config({ path: '.env.local' });

const db = drizzle(process.env.DATABASE_URL!);

async function seed() {
  console.log('🌱 Seeding database...');

  // ─── Categorie ──────────────────────────────────────────────────────────────
  const categoryNames = [
    'Auto', 'Immobili', 'Tecnologia', 'Trasporti', 'Lusso',
    'Imprese', 'Sport', 'Intrattenimento', 'Energia', 'Potere',
    'Scienza', 'Turismo', 'Animali', 'Università', 'Quadri',
  ];

  const insertedCategories = await db.insert(schema.categories)
    .values(categoryNames.map(name => ({ name })))
    .onConflictDoNothing()
    .returning();

  const catMap = Object.fromEntries(insertedCategories.map(c => [c.name, c.id]));
  console.log(`✅ ${insertedCategories.length} categorie inserite`);

  // ─── Beni ───────────────────────────────────────────────────────────────────
  const goodsData = [
    { name: 'Utilitaria',            category: 'Auto',           baseValue: 12 },
    { name: 'SUV',                   category: 'Auto',           baseValue: 20 },
    { name: 'Auto da corsa',         category: 'Auto',           baseValue: 28 },
    { name: 'Appartamento',          category: 'Immobili',       baseValue: 17 },
    { name: 'Villa',                 category: 'Immobili',       baseValue: 20 },
    { name: 'Grattacielo',           category: 'Immobili',       baseValue: 23 },
    { name: 'Robot',                 category: 'Tecnologia',     baseValue: 10 },
    { name: 'Satellite',             category: 'Tecnologia',     baseValue: 19 },
    { name: 'Computer Quantistico',  category: 'Tecnologia',     baseValue: 31 },
    { name: 'Moto',                  category: 'Trasporti',      baseValue: 13 },
    { name: 'Elicottero',            category: 'Trasporti',      baseValue: 21 },
    { name: 'Jet Privato',           category: 'Trasporti',      baseValue: 26 },
    { name: 'Orologio Raro',         category: 'Lusso',          baseValue: 9  },
    { name: 'Diamante',              category: 'Lusso',          baseValue: 22 },
    { name: 'Yacht',                 category: 'Lusso',          baseValue: 29 },
    { name: 'Ristorante',            category: 'Imprese',        baseValue: 14 },
    { name: 'Casa Automobilistica',  category: 'Imprese',        baseValue: 20 },
    { name: 'Banca',                 category: 'Imprese',        baseValue: 26 },
    { name: 'Arena Sportiva',        category: 'Sport',          baseValue: 16 },
    { name: 'Circuito F1',           category: 'Sport',          baseValue: 19 },
    { name: 'Squadra di Calcio',     category: 'Sport',          baseValue: 25 },
    { name: 'Cinema',                category: 'Intrattenimento',baseValue: 11 },
    { name: 'Casa di Produzione',    category: 'Intrattenimento',baseValue: 20 },
    { name: 'Piattaforma Streaming', category: 'Intrattenimento',baseValue: 29 },
    { name: 'Parco Eolico',          category: 'Energia',        baseValue: 13 },
    { name: 'Centrale Solare',       category: 'Energia',        baseValue: 17 },
    { name: 'Centrale Nucleare',     category: 'Energia',        baseValue: 30 },
    { name: 'Comune',                category: 'Potere',         baseValue: 10 },
    { name: 'Parlamento',            category: 'Potere',         baseValue: 23 },
    { name: 'Governo',               category: 'Potere',         baseValue: 27 },
    { name: 'Laboratorio',           category: 'Scienza',        baseValue: 12 },
    { name: 'Centro Ricerca',        category: 'Scienza',        baseValue: 21 },
    { name: 'Agenzia Spaziale',      category: 'Scienza',        baseValue: 27 },
    { name: 'Villaggio Vacanze',     category: 'Turismo',        baseValue: 15 },
    { name: 'Resort',                category: 'Turismo',        baseValue: 18 },
    { name: 'Isola Privata',         category: 'Turismo',        baseValue: 27 },
    { name: 'Gallina',               category: 'Animali',        baseValue: 12 },
    { name: 'Cavallo',               category: 'Animali',        baseValue: 20 },
    { name: 'Leone',                 category: 'Animali',        baseValue: 28 },
    { name: 'Bicocca',               category: 'Università',     baseValue: 15 },
    { name: 'Cattolica',             category: 'Università',     baseValue: 20 },
    { name: 'Bocconi',               category: 'Università',     baseValue: 25 },
    { name: 'La Gioconda',           category: 'Quadri',         baseValue: 16 },
    { name: 'Guernica',              category: 'Quadri',         baseValue: 20 },
    { name: 'La Notte Stellata',     category: 'Quadri',         baseValue: 24 },
  ];

  const insertedGoods = await db.insert(schema.goods)
    .values(goodsData.map(g => ({
      name: g.name,
      categoryId: catMap[g.category],
      baseValue: g.baseValue,
    })))
    .onConflictDoNothing()
    .returning();

  console.log(`✅ ${insertedGoods.length} beni inseriti`);

  console.log('🎉 Seed completato!');
}

seed().catch(console.error);
