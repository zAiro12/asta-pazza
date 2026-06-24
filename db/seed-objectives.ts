/**
 * seed-objectives.ts
 * Inserisce tutti gli obiettivi (categoria_base, comune, raro) nel DB.
 * Eseguire con: npx tsx db/seed-objectives.ts
 * È idempotente: usa onConflictDoNothing su (name, type).
 */
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
import { config } from 'dotenv';

config({ path: '.env.local' });

const db = drizzle(process.env.DATABASE_URL!);

// Recupera l'id di una categoria per nome
async function getCatId(db: ReturnType<typeof drizzle>, name: string): Promise<number> {
  const rows = await db.select().from(schema.categories).where(
    (schema.categories as any).name.eq ? (schema.categories as any).name.eq(name) : undefined
  );
  // fallback: query raw
  const result = await (db as any).execute(
    `SELECT id FROM categories WHERE name = '${name.replace("'", "''")}' LIMIT 1`
  );
  const id = result.rows?.[0]?.id ?? result[0]?.id;
  if (!id) throw new Error(`Categoria non trovata: ${name}`);
  return Number(id);
}

async function getGoodId(db: ReturnType<typeof drizzle>, name: string): Promise<number> {
  const result = await (db as any).execute(
    `SELECT id FROM goods WHERE name = '${name.replace("'", "''")}' LIMIT 1`
  );
  const id = result.rows?.[0]?.id ?? result[0]?.id;
  if (!id) throw new Error(`Bene non trovato: ${name}`);
  return Number(id);
}

async function seed() {
  console.log('🎯 Seeding obiettivi...');

  // Mappa categorie
  const catNames = [
    'Auto','Immobili','Tecnologia','Trasporti','Lusso',
    'Imprese','Sport','Intrattenimento','Energia','Potere',
    'Scienza','Turismo','Animali','Università','Quadri',
  ];
  const catIds: Record<string, number> = {};
  for (const name of catNames) {
    catIds[name] = await getCatId(db, name);
  }

  // Mappa beni specifici usati nei rari
  const goodNames = [
    'Leone','Bocconi','La Gioconda','Governo','Computer Quantistico',
    'Piattaforma Streaming','Isola Privata','Squadra di Calcio',
    'Agenzia Spaziale','Banca','Yacht','La Notte Stellata',
    'Centrale Nucleare','Diamante','Auto da corsa',
  ];
  const goodIds: Record<string, number> = {};
  for (const name of goodNames) {
    goodIds[name] = await getGoodId(db, name);
  }

  // ─── CATEGORIA BASE (x1 ciascuno) ──────────────────────────────────────────
  const categoriaBase = catNames.map(cat => ({
    name: `Categoria Base - ${cat}`,
    type: 'categoria_base' as const,
    description: `Possiedi almeno 2 beni della categoria ${cat}.`,
    points: 15,
    copies: 1,
    condition: { type: 'min_goods_in_category', categoryId: catIds[cat], count: 2 },
  }));

  // ─── COMUNI (x2 ciascuno) ───────────────────────────────────────────────────
  // Obiettivi "tua categoria + categoria X"
  const comuniCross = catNames.map(cat => ({
    name: categoryToCommonName(cat),
    type: 'comune' as const,
    description: `Possiedi almeno 1 bene della tua categoria e almeno 1 bene ${cat}.`,
    points: 15,
    copies: 2,
    condition: { type: 'min_base_category_goods_and_category', count: 1, otherCategoryId: catIds[cat], otherCount: 1 },
  }));

  const comuniAltri = [
    {
      name: 'Mercante',
      type: 'comune' as const,
      description: 'Finisci la partita con almeno 20 crediti.',
      points: 15, copies: 2,
      condition: { type: 'min_credits', amount: 20 },
    },
    {
      name: 'Risparmiatore',
      type: 'comune' as const,
      description: 'Finisci la partita con almeno 30 crediti.',
      points: 30, copies: 2,
      condition: { type: 'min_credits', amount: 30 },
    },
    {
      name: 'Collezionista',
      type: 'comune' as const,
      description: 'Ottieni almeno 1 Mini-Collezione diversa dalla tua categoria base.',
      points: 15, copies: 2,
      condition: { type: 'min_mini_collections_outside_base', count: 1 },
    },
    {
      name: 'Investitore',
      type: 'comune' as const,
      description: 'Possiedi almeno 3 beni totali.',
      points: 15, copies: 2,
      condition: { type: 'min_goods', count: 3 },
    },
    {
      name: 'Colpo Sicuro',
      type: 'comune' as const,
      description: 'Possiedi almeno 1 bene da 25 punti o più.',
      points: 15, copies: 2,
      condition: { type: 'min_good_value', value: 25, count: 1 },
    },
    {
      name: 'Pezzo Pregiato',
      type: 'comune' as const,
      description: 'Possiedi almeno 1 bene da 27 punti o più.',
      points: 20, copies: 2,
      condition: { type: 'min_good_value', value: 27, count: 1 },
    },
    {
      name: 'Collezionista Prudente',
      type: 'comune' as const,
      description: 'Ottieni almeno 1 Mini-Collezione e termina con almeno 20 crediti.',
      points: 20, copies: 2,
      condition: { type: 'min_mini_collections_and_credits', collections: 1, credits: 20 },
    },
    {
      name: "Uomo d'Affari Solido",
      type: 'comune' as const,
      description: 'Termina con almeno 20 crediti e almeno 4 beni.',
      points: 20, copies: 2,
      condition: { type: 'min_credits_and_goods', credits: 20, goods: 4 },
    },
    {
      name: 'Magnate Emergente',
      type: 'comune' as const,
      description: 'Possiedi almeno 2 beni da 25 punti o più.',
      points: 20, copies: 2,
      condition: { type: 'min_good_value', value: 25, count: 2 },
    },
    {
      name: 'Portafoglio Diversificato',
      type: 'comune' as const,
      description: 'Possiedi almeno 1 bene in 3 categorie diverse.',
      points: 20, copies: 2,
      condition: { type: 'min_categories', count: 3 },
    },
  ];

  // ─── RARI (x1 ciascuno) ─────────────────────────────────────────────────────
  const rari = [
    { name: 'Diversificatore', points: 35, copies: 1, description: 'Possiedi almeno 1 bene in 5 categorie diverse.', condition: { type: 'min_categories', count: 5 } },
    { name: 'Dominatore', points: 33, copies: 1, description: 'Possiedi almeno 6 beni totali.', condition: { type: 'min_goods', count: 6 } },
    { name: 'Accumulatore', points: 30, copies: 1, description: 'Possiedi almeno 5 beni totali.', condition: { type: 'min_goods', count: 5 } },
    { name: 'Opportunista', points: 35, copies: 1, description: 'Possiedi almeno 7 beni.', condition: { type: 'min_goods', count: 7 } },
    { name: 'Re Mida', points: 30, copies: 1, description: 'Sei il giocatore con più crediti rimasti.', condition: { type: 'most_credits' } },
    { name: 'Colpo Grosso', points: 30, copies: 1, description: 'Possiedi il bene di valore base più alto tra tutti i giocatori.', condition: { type: 'highest_value_good' } },
    { name: "Campione degli Affari", points: 35, copies: 1, description: 'Possiedi almeno 2 Imprese e 2 Immobili.', condition: { type: 'multi_category_min', requirements: [{ categoryId: catIds['Imprese'], count: 2 }, { categoryId: catIds['Immobili'], count: 2 }] } },
    { name: 'Conglomerato', points: 40, copies: 1, description: 'Possiedi almeno 2 della tua categoria, 2 di una a scelta e 1 di un altra.', condition: { type: 'conglomerato' } },
    { name: 'Potere Assoluto', points: 35, copies: 1, description: 'Possiedi almeno 2 della tua categoria e 2 di un altra categoria.', condition: { type: 'base_plus_other', baseCount: 2, otherCount: 2 } },
    { name: 'Re delle Mini-Collezioni', points: 35, copies: 1, description: 'Possiedi beni in almeno 5 categorie diverse.', condition: { type: 'min_categories', count: 5 } },
    { name: 'Investitore Prudente', points: 30, copies: 1, description: 'Non hai usato il Prestito e termini con almeno 20 crediti.', condition: { type: 'no_scugnizzu_and_min_credits', credits: 20 } },
    { name: 'Colpo di Mercato', points: 35, copies: 1, description: 'Possiedi il bene di valore più alto di almeno 2 categorie.', condition: { type: 'top_good_in_categories', count: 2 } },
    { name: 'Impero Diversificato', points: 40, copies: 1, description: 'Possiedi almeno 1 bene in 6 categorie diverse.', condition: { type: 'min_categories', count: 6 } },
    { name: 'Collezionista Povero', points: 30, copies: 1, description: 'Completa almeno 2 Mini-Collezioni e termina con meno di 10 crediti.', condition: { type: 'min_mini_collections_and_max_credits', collections: 2, maxCredits: 9 } },
    { name: 'Ricco Sfondato', points: 35, copies: 1, description: 'Termina con almeno 30 crediti e non più di 5 beni.', condition: { type: 'max_goods_and_min_credits', maxGoods: 5, credits: 30 } },
    { name: 'Equilibrio Perfetto', points: 0, copies: 1, description: 'Non possiedi più di 1 bene in nessuna categoria. Vale 15 punti per ogni categoria con 1 bene.', condition: { type: 'equilibrio_perfetto' } },
    { name: 'Monopolista', points: 30, copies: 1, description: 'Possiedi la maggioranza in almeno 2 categorie.', condition: { type: 'min_majorities', count: 2 } },
    { name: 'Visionario', points: 35, copies: 1, description: 'Possiedi 2 beni in almeno 3 categorie.', condition: { type: 'min_categories_with_count', categoriesCount: 3, goodsPerCategory: 2 } },
    { name: 'Opportunista Supremo', points: 30, copies: 1, description: 'Possiedi beni in almeno 4 categorie.', condition: { type: 'min_categories', count: 4 } },
    { name: 'Collezionista Supremo', points: 30, copies: 1, description: 'Completa almeno 1 Collezione Completa.', condition: { type: 'min_complete_collections', count: 1 } },
    { name: 'Re delle Coppie', points: 35, copies: 1, description: 'Ottieni almeno 2 Mini-Collezioni e possiedi almeno 1 altro bene.', condition: { type: 'min_mini_collections_and_goods', collections: 2, extraGoods: 1 } },
    { name: 'Dominio Totale', points: 40, copies: 1, description: 'Completa almeno 1 Collezione Completa e termina con almeno 25 crediti.', condition: { type: 'min_complete_collections_and_credits', collections: 1, credits: 25 } },
    { name: 'Collezionista Ossessivo', points: 35, copies: 1, description: 'Completa 1 Collezione Completa e 1 Mini-Collezione e termina con almeno 15 crediti.', condition: { type: 'complete_and_mini_and_credits', complete: 1, mini: 1, credits: 15 } },
    { name: 'Maestro delle Collezioni', points: 40, copies: 1, description: 'Ottieni almeno 3 Mini-Collezioni.', condition: { type: 'min_mini_collections', count: 3 } },
    { name: 'Magnate Globale', points: 35, copies: 1, description: 'Possiedi almeno 6 beni totali.', condition: { type: 'min_goods', count: 6 } },
    { name: 'Portafoglio Bilanciato', points: 35, copies: 1, description: 'Possiedi 1 bene in almeno 4 categorie e almeno 25 crediti.', condition: { type: 'min_categories_and_credits', categories: 4, credits: 25 } },
    { name: 'Speculatore', points: 35, copies: 1, description: 'Possiedi almeno 3 beni da 25 punti o più.', condition: { type: 'min_good_value', value: 25, count: 3 } },
    { name: 'Mecenate', points: 35, copies: 1, description: 'Possiedi almeno 2 Quadri e 2 Università.', condition: { type: 'multi_category_min', requirements: [{ categoryId: catIds['Quadri'], count: 2 }, { categoryId: catIds['Università'], count: 2 }] } },
    { name: 'Impero Mediatico', points: 35, copies: 1, description: 'Possiedi almeno 2 Intrattenimento e 2 Lusso.', condition: { type: 'multi_category_min', requirements: [{ categoryId: catIds['Intrattenimento'], count: 2 }, { categoryId: catIds['Lusso'], count: 2 }] } },
    { name: 'Re del Mondo', points: 35, copies: 1, description: 'Possiedi almeno 2 Turismo e 2 Trasporti.', condition: { type: 'multi_category_min', requirements: [{ categoryId: catIds['Turismo'], count: 2 }, { categoryId: catIds['Trasporti'], count: 2 }] } },
    { name: 'Triangolo d\'Oro', points: 35, copies: 1, description: 'Possiedi almeno 1 Lusso, 1 Potere e 1 Imprese.', condition: { type: 'multi_category_min', requirements: [{ categoryId: catIds['Lusso'], count: 1 }, { categoryId: catIds['Potere'], count: 1 }, { categoryId: catIds['Imprese'], count: 1 }] } },
    { name: 'Magnate Culturale', points: 35, copies: 1, description: 'Possiedi 2 beni della tua categoria e 2 di altre 2 categorie diverse.', condition: { type: 'magnate_culturale' } },
    // Rari con beni specifici
    { name: 'Cacciatore di Trofei', points: 45, copies: 1, description: 'Possiedi Leone, almeno 1 Università e almeno 1 Quadro.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Leone'], categories: [{ categoryId: catIds['Università'], count: 1 }, { categoryId: catIds['Quadri'], count: 1 }] } },
    { name: 'Nuovo Rinascimento', points: 45, copies: 1, description: 'Possiedi La Gioconda, almeno 1 Università e almeno 1 Scienza.', condition: { type: 'specific_good_and_categories', goodId: goodIds['La Gioconda'], categories: [{ categoryId: catIds['Università'], count: 1 }, { categoryId: catIds['Scienza'], count: 1 }] } },
    { name: 'Collezione Presidenziale', points: 45, copies: 1, description: 'Possiedi Governo, almeno 1 Impresa e almeno 1 Lusso.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Governo'], categories: [{ categoryId: catIds['Imprese'], count: 1 }, { categoryId: catIds['Lusso'], count: 1 }] } },
    { name: 'Visione del Futuro', points: 45, copies: 1, description: 'Possiedi Computer Quantistico, almeno 1 Scienza e almeno 1 Energia.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Computer Quantistico'], categories: [{ categoryId: catIds['Scienza'], count: 1 }, { categoryId: catIds['Energia'], count: 1 }] } },
    { name: 'Influencer Globale', points: 45, copies: 1, description: 'Possiedi Piattaforma Streaming, almeno 1 Sport e almeno 1 Lusso.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Piattaforma Streaming'], categories: [{ categoryId: catIds['Sport'], count: 1 }, { categoryId: catIds['Lusso'], count: 1 }] } },
    { name: 'Re delle Vacanze', points: 45, copies: 1, description: 'Possiedi Isola Privata, almeno 1 Trasporto e almeno 1 Lusso.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Isola Privata'], categories: [{ categoryId: catIds['Trasporti'], count: 1 }, { categoryId: catIds['Lusso'], count: 1 }] } },
    { name: 'Magnate Sportivo', points: 45, copies: 1, description: 'Possiedi Squadra di Calcio, almeno 1 Trasporto e almeno 1 Lusso.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Squadra di Calcio'], categories: [{ categoryId: catIds['Trasporti'], count: 1 }, { categoryId: catIds['Lusso'], count: 1 }] } },
    { name: 'Dinastia', points: 45, copies: 1, description: 'Possiedi Governo, almeno 1 Impresa e almeno 1 Università.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Governo'], categories: [{ categoryId: catIds['Imprese'], count: 1 }, { categoryId: catIds['Università'], count: 1 }] } },
    { name: 'Potenza Industriale', points: 45, copies: 1, description: 'Possiedi Banca, almeno 1 Impresa e almeno 1 Energia.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Banca'], categories: [{ categoryId: catIds['Imprese'], count: 1 }, { categoryId: catIds['Energia'], count: 1 }] } },
    { name: 'Scienziato Pazzo', points: 45, copies: 1, description: 'Possiedi Agenzia Spaziale, almeno 1 Tecnologia e almeno 1 Energia.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Agenzia Spaziale'], categories: [{ categoryId: catIds['Tecnologia'], count: 1 }, { categoryId: catIds['Energia'], count: 1 }] } },
    { name: 'Miliardario Eccentrico', points: 45, copies: 1, description: 'Possiedi Yacht, almeno 1 Quadro e almeno 1 Animale.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Yacht'], categories: [{ categoryId: catIds['Quadri'], count: 1 }, { categoryId: catIds['Animali'], count: 1 }] } },
    { name: 'Re della Savana', points: 45, copies: 1, description: 'Possiedi Leone, almeno 1 Turismo e almeno 1 Lusso.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Leone'], categories: [{ categoryId: catIds['Turismo'], count: 1 }, { categoryId: catIds['Lusso'], count: 1 }] } },
    { name: "Accademia d'Élite", points: 45, copies: 1, description: 'Possiedi Bocconi, almeno 1 Quadro e almeno 1 Impresa.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Bocconi'], categories: [{ categoryId: catIds['Quadri'], count: 1 }, { categoryId: catIds['Imprese'], count: 1 }] } },
    { name: 'Arte Senza Tempo', points: 45, copies: 1, description: 'Possiedi La Notte Stellata, almeno 1 Università e almeno 1 Lusso.', condition: { type: 'specific_good_and_categories', goodId: goodIds['La Notte Stellata'], categories: [{ categoryId: catIds['Università'], count: 1 }, { categoryId: catIds['Lusso'], count: 1 }] } },
    { name: 'Reattore del Futuro', points: 45, copies: 1, description: 'Possiedi Centrale Nucleare, almeno 1 Tecnologia e almeno 1 Scienza.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Centrale Nucleare'], categories: [{ categoryId: catIds['Tecnologia'], count: 1 }, { categoryId: catIds['Scienza'], count: 1 }] } },
    { name: 'Dominio dei Mari', points: 45, copies: 1, description: 'Possiedi Diamante, almeno 1 Turismo e almeno 1 Trasporto.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Diamante'], categories: [{ categoryId: catIds['Turismo'], count: 1 }, { categoryId: catIds['Trasporti'], count: 1 }] } },
    { name: 'Pioniere Spaziale', points: 45, copies: 1, description: 'Possiedi Agenzia Spaziale, almeno 1 Università e almeno 1 Tecnologia.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Agenzia Spaziale'], categories: [{ categoryId: catIds['Università'], count: 1 }, { categoryId: catIds['Tecnologia'], count: 1 }] } },
    { name: 'Re delle Corse', points: 45, copies: 1, description: 'Possiedi Auto da corsa, almeno 1 Sport e almeno 1 Trasporto.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Auto da corsa'], categories: [{ categoryId: catIds['Sport'], count: 1 }, { categoryId: catIds['Trasporti'], count: 1 }] } },
    { name: 'Patrimonio Mondiale', points: 45, copies: 1, description: 'Possiedi La Gioconda, almeno 1 Turismo e almeno 1 Immobile.', condition: { type: 'specific_good_and_categories', goodId: goodIds['La Gioconda'], categories: [{ categoryId: catIds['Turismo'], count: 1 }, { categoryId: catIds['Immobili'], count: 1 }] } },
    { name: 'Impero Finanziario', points: 45, copies: 1, description: 'Possiedi Squadra di Calcio, almeno 1 Potere e almeno 1 Impresa.', condition: { type: 'specific_good_and_categories', goodId: goodIds['Squadra di Calcio'], categories: [{ categoryId: catIds['Potere'], count: 1 }, { categoryId: catIds['Imprese'], count: 1 }] } },
    { name: "Collezionista d'Élite", points: 40, copies: 1, description: 'Possiedi almeno 1 bene da 25+ punti e 2 beni da 20 punti o meno.', condition: { type: 'elite_collector' } },
    { name: 'Tycoon', points: 30, copies: 1, description: 'Ottieni almeno 1 Collezione Completa e 1 Maggioranza.', condition: { type: 'tycoon' } },
  ].map(r => ({ ...r, type: 'raro' as const }));

  // ─── INSERT ─────────────────────────────────────────────────────────────────
  const allObjectives = [
    ...categoriaBase,
    ...comuniCross,
    ...comuniAltri,
    ...rari,
  ];

  // Inserisce a batch di 20 per evitare timeout
  let inserted = 0;
  for (let i = 0; i < allObjectives.length; i += 20) {
    const batch = allObjectives.slice(i, i + 20);
    const res = await db.insert(schema.objectives)
      .values(batch.map(o => ({
        name: o.name,
        type: o.type,
        description: o.description,
        points: o.points,
        copies: o.copies,
        condition: o.condition,
      })))
      .onConflictDoNothing()
      .returning();
    inserted += res.length;
  }

  console.log(`✅ ${inserted} obiettivi inseriti (${allObjectives.length} totali, i duplicati vengono ignorati)`);
}

// Mappa categoria -> nome obiettivo comune cross
function categoryToCommonName(cat: string): string {
  const map: Record<string, string> = {
    'Auto': 'Appassionato di Motori',
    'Immobili': 'Costruttore',
    'Tecnologia': 'Innovatore',
    'Trasporti': 'Pilota',
    'Lusso': 'Collezionista di Lusso',
    'Imprese': "Uomo d'Affari",
    'Sport': 'Sportivo',
    'Intrattenimento': 'Produttore',
    'Energia': 'Ambientalista',
    'Potere': 'Leader',
    'Scienza': 'Esploratore Scientifico',
    'Turismo': 'Viaggiatore',
    'Animali': 'Naturalista',
    'Università': 'Accademico',
    'Quadri': 'Mecenate',
  };
  return map[cat] ?? `Cross - ${cat}`;
}

seed().catch(console.error);
