import type { NoteInput } from './notes'

/**
 * Sample notes for first-time visitors.
 * Clustered by theme (cooking, travel, work) so semantic search
 * and related-notes features are immediately demonstrable.
 */
export const DEMO_NOTES: NoteInput[] = [
  {
    title: 'Classic Pasta Carbonara',
    body: `A Roman staple that's simple to make but easy to get wrong.

Ingredients: 200g spaghetti, 100g guanciale (or pancetta), 2 whole eggs + 2 yolks, 50g Pecorino Romano finely grated, lots of black pepper.

Method: render the guanciale in a dry pan until crispy and the fat runs. Cook pasta al dente and reserve a cup of starchy water. Remove pan from heat. Toss hot pasta with guanciale fat. Add egg-and-cheese mixture, tossing vigorously while adding pasta water a splash at a time until silky.

The cardinal rule: no cream, ever. The creaminess comes entirely from emulsifying eggs with starchy pasta water.`,
    tags: [],
  },
  {
    title: 'Sourdough Starter — Week 1 Notes',
    body: `Documenting my first sourdough starter.

Day 1: Mixed 50g whole wheat flour + 50g room-temp water in a jar. Left loosely covered on the counter.
Day 3: Faint sour smell, a few bubbles appearing. Discarded half, fed with 50g bread flour + 50g water.
Day 5: More activity — doubles in size about 8 hours after feeding.
Day 7: Passes the float test! Ready to bake.

Key learnings: use room-temp water (chlorine in tap water can inhibit fermentation), feed at the same time each day, temperature matters a lot — a warmer kitchen means faster fermentation.`,
    tags: [],
  },
  {
    title: 'Japanese Pantry Essentials',
    body: `Must-have items for Japanese home cooking:

- Soy sauce (usukuchi for light/delicate dishes, koikuchi for everyday use)
- Mirin (adds sweetness and gloss to sauces and glazes)
- Sake (for marinades and deglazing)
- Dashi (kombu + katsuobushi — the umami foundation of Japanese cooking)
- White and red miso paste
- Rice vinegar
- Sesame oil (finishing only, not for high-heat cooking)
- Japanese short-grain rice

With these staples you can make teriyaki, miso soup, tsukemono pickles, ramen tare, and most classic Japanese dishes. Buy at an Asian grocery store — quality difference vs. supermarket imports is significant.`,
    tags: [],
  },
  {
    title: 'Tokyo — Neighborhood Guide',
    body: `Beyond the tourist circuit:

Shimokitazawa: vinyl records, vintage fashion, tiny jazz bars, indie theatre. The soul of Tokyo's alternative scene.

Yanaka: old-town atmosphere that survived WWII bombing. Cats everywhere. Artisan workshops, sembei shops, a beautiful cemetery perfect for afternoon walks.

Koenji: subculture central — more vintage shops, live music venues, cult curry restaurants.

Kagurazaka: French-quarter vibe meets old Tokyo. Cobblestone alleys, excellent bakeries, bistros run by French expats.

Pro tips: Get a Suica card at the airport — works on all trains and convenience stores. Most museums are closed Mondays. Download Google Maps offline before you go.`,
    tags: [],
  },
  {
    title: 'Kyoto — 3-Day Itinerary',
    body: `Day 1 — Arashiyama & Fushimi
Arrive at the bamboo grove at 6am before tour groups descend. Rent a bicycle, visit Tenryu-ji's garden, have tofu lunch in Sagano. Afternoon: Fushimi Inari — hike the full ridge trail, not just the lower gates.

Day 2 — Central & Higashiyama
Morning: Philosopher's Path, Nanzen-ji aqueduct. Afternoon: Nishiki Market (the city's "kitchen"), Kiyomizudera at golden hour. Evening: Gion for the chance of spotting a geiko.

Day 3 — Temples & Tea
Ryoan-ji rock garden at opening (8am, before the crowds). Kinkaku-ji (inevitable but worth it). Afternoon tea ceremony in the Urasenke district.

Cycling the city is far better than taxis — flat terrain, rental bikes everywhere.`,
    tags: [],
  },
  {
    title: 'Lisbon Weekend Notes',
    body: `A long-weekend trip, staying in Mouraria near the tram 28 route.

Friday: Arrived evening, walked Alfama streets with fado music drifting from restaurant doorways.

Saturday: Hiked up to São Jorge castle (the view from the walls is worth every step). Detoured to pastéis de nata at Pastéis de Belém — the queue moves fast, the custard tarts are extraordinary. Sunset at Miradouro da Graça with locals drinking Super Bock.

Sunday: LX Factory Sunday market — excellent vintage, solid food stalls. Booked Cervejaria Ramiro for the shellfish lunch. Worth every euro.

Overall: the city is astonishingly walkable. The hills are real but the views pay for the climb. Fado is everywhere and it's not a tourist act — people genuinely love it.`,
    tags: [],
  },
  {
    title: 'Q3 Engineering Retrospective',
    body: `Sprint 14–20 retrospective for the SafeSearch project.

What went well:
• Shipped semantic search feature 2 weeks early
• Async-first approach reduced meeting load by ~40%
• Test coverage improved from 38% → 79%
• Zero P0 incidents this quarter

What needs improvement:
• Infrastructure tasks consistently underestimated (apply 2x factor)
• Cross-team dependency visibility still poor — people surprised by blockers
• Onboarding docs for new engineers last updated 8 months ago

Action items:
1. Add 2x multiplier to infra task estimates in planning [whole team]
2. Weekly cross-team dependency check on Fridays [PM]
3. Engineering wiki refresh sprint in Q4 [staff eng]`,
    tags: [],
  },
  {
    title: 'Weekly Review Template',
    body: `A Sunday evening ritual — takes about 30 minutes.

1. Brain dump — capture everything floating in my head into the inbox
2. Review last week — what did I complete? what slipped and why?
3. Check long-horizon goals — am I making meaningful progress toward them?
4. Plan this week — pick 3 outcomes that would make the week a win
5. Block the calendar — at least 2 × 2-hour deep work blocks before Thursday
6. Clear inbox to zero

The key question: what's the one thing that would make this week feel successful?

Running this consistently makes quarterly reviews almost effortless — everything is already captured and the patterns are obvious.`,
    tags: [],
  },
]
