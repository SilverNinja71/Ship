// The Lookout's video groups: what it knows, written down ahead of time, so
// most watch pages are sorted on the spot without asking Gemini. Subjects
// (with their telltale terms and course codes), kinds of video (lessons,
// study audio, and the usual distractions), well-known channels, and
// YouTube's own categories. All phrases are matched on normalized text
// (lowercase, no punctuation, "&" read as "and").

import { normalize } from "@ship/active-recall-engine";

/** Comma-separated phrases, normalized, empties dropped. */
const phrases = (text: string): string[] => [...new Set(text.split(/[,\n]/).map((p) => normalize(p)).filter(Boolean))];

// ---------------------------------------------------------------------------
// Subjects

export type SubjectId =
  | "math"
  | "statistics"
  | "physics"
  | "chemistry"
  | "biology"
  | "medicine"
  | "earth-space"
  | "computer-science"
  | "engineering"
  | "history"
  | "government"
  | "economics"
  | "english"
  | "psychology"
  | "philosophy"
  | "arts"
  | "geography"
  | "spanish"
  | "french"
  | "german"
  | "japanese"
  | "chinese"
  | "korean"
  | "latin"
  | "italian"
  | "arabic"
  | "portuguese"
  | "russian"
  | "sign-language";

export interface SubjectGroup {
  id: SubjectId;
  /** For reasons: "a biology video". */
  name: string;
  /** Words and phrases that point to this subject in a title, a description or an assignment. */
  terms: string[];
  /** Course names and codes ("BIO 201", "AP Calc"); only read from the study context. */
  codes: string[];
  /** Subjects close enough that a lesson in one may help with the other. */
  related: SubjectId[];
}

const subject = (id: SubjectId, name: string, related: SubjectId[], codes: string, terms: string): SubjectGroup => ({
  id,
  name,
  related,
  codes: phrases(codes),
  terms: phrases(terms),
});

export const SUBJECTS: readonly SubjectGroup[] = [
  subject(
    "math",
    "math",
    ["statistics", "physics", "computer-science", "engineering"],
    "math, maths, mth, calc, algebra, alg, geometry, geom, precalc, trig, ap calc, ap calculus, ab calc, bc calc",
    `math, maths, mathematics, mathematical, algebra, algebraic, geometry, trigonometry, trig, calculus, precalculus, pre calculus,
    derivative, derivatives, differentiation, integral, integrals, antiderivative, chain rule, product rule, quotient rule,
    power rule, lhopital, lhopitals rule, taylor series, maclaurin series, fourier series, differential equation, differential equations,
    linear algebra, matrices, matrix multiplication, determinant, eigenvalue, eigenvalues, eigenvector, eigenvectors, vector space, dot product,
    cross product, polynomial, polynomials, quadratic, quadratic formula, quadratic equation, completing the square, factoring,
    logarithm, logarithms, log rules, exponential function, exponential functions, pythagorean theorem, unit circle, sine, cosine,
    sohcahtoa, slope intercept, linear equation, linear equations, systems of equations, solving inequalities, linear inequalities,
    fractions, long division,
    order of operations, pemdas, number theory, prime numbers, mathematical induction, proof by induction, set theory, discrete math,
    discrete mathematics, combinatorics, permutations, real analysis, complex analysis, abstract algebra, group theory, topology,
    vector calculus, multivariable calculus, partial derivative, partial derivatives, double integral, double integrals, triple integral,
    riemann sum, area under the curve, related rates, implicit differentiation, u substitution, integration by parts, trig identities,
    conic sections, parabola, hyperbola, asymptote, asymptotes, rational functions, piecewise functions, domain and range,
    inverse functions, complex numbers, imaginary numbers, arithmetic sequence, geometric sequence, geometric series, limits and continuity`,
  ),
  subject(
    "statistics",
    "statistics",
    ["math", "psychology", "economics", "computer-science"],
    "stat, stats, statistics, ap stats, ap statistics, biostat, biostatistics",
    `statistics, statistical, probability, standard deviation, variance, normal distribution, binomial distribution, poisson distribution,
    z score, z scores, t test, chi square, hypothesis test, hypothesis testing, null hypothesis, p value, p values, confidence interval,
    confidence intervals, linear regression, regression analysis, correlation coefficient, sampling distribution, central limit theorem,
    bayes theorem, bayesian, expected value, random variable, random variables, anova, standard error, margin of error, box plot,
    scatter plot, histogram, statquest`,
  ),
  subject(
    "physics",
    "physics",
    ["math", "engineering", "chemistry", "earth-space"],
    "phys, physics, phy, ap physics, ap physics 1, ap physics c",
    `physics, newtons laws, newtons first law, newtons second law, newtons third law, kinematics, projectile motion, velocity,
    acceleration, momentum, conservation of momentum, conservation of energy, kinetic energy, potential energy, work energy theorem,
    torque, angular momentum, rotational motion, circular motion, centripetal force, centripetal acceleration, friction,
    free body diagram, free body diagrams, simple harmonic motion, oscillation, oscillations, pendulum, electric field, electric fields,
    magnetic field, magnetic fields, electric potential, coulombs law, gauss law, gausss law, faradays law, amperes law, lenzs law,
    electromagnetic induction, electromagnetism, maxwells equations, ohms law, kirchhoffs laws, capacitor, capacitors, optics,
    refraction, snells law, diffraction, thermodynamics, ideal gas law, specific heat, quantum mechanics, quantum physics,
    schrodinger equation, wave function, special relativity, general relativity, relativity, nuclear physics, particle physics,
    fluid dynamics, buoyancy, bernoullis principle, universal gravitation, gravitational force, orbital mechanics`,
  ),
  subject(
    "chemistry",
    "chemistry",
    ["biology", "physics", "medicine"],
    "chem, chemistry, chm, ochem, orgo, organic chemistry, gen chem, biochem, ap chem, ap chemistry",
    `chemistry, chemical, organic chemistry, ochem, orgo, general chemistry, gen chem, biochemistry, stoichiometry, mole, moles,
    molar mass, molarity, limiting reagent, percent yield, balancing equations, balancing chemical equations, chemical equation,
    chemical equations, chemical reaction, chemical reactions, periodic table, electron configuration, orbitals, valence electrons,
    lewis structure, lewis structures, vsepr, hybridization, covalent bond, covalent bonds, ionic bond, ionic bonds,
    intermolecular forces, hydrogen bonding, electronegativity, acids and bases, ph scale, titration, buffer solution, buffers,
    equilibrium constant, le chatelier, le chateliers principle, reaction rate, reaction rates, rate law, activation energy, enthalpy,
    gibbs free energy, hess law, hesss law, electrochemistry, redox, oxidation states, galvanic cell, sn1, sn2, nucleophile,
    electrophile, alkene, alkenes, alkane, alkanes, alkyne, alkynes, functional groups, resonance structures, chirality,
    stereochemistry, isomers, nmr, ir spectroscopy, mass spectrometry, gas laws, kinetic molecular theory, solubility,
    colligative properties, nuclear chemistry, ionization energy, atomic radius, polarity, polyatomic ions`,
  ),
  subject(
    "biology",
    "biology",
    ["chemistry", "medicine", "psychology", "earth-space"],
    "bio, biol, biology, ap bio, ap biology, anatomy, physiology, a and p, genetics, ecology, microbio, microbiology",
    `biology, biological, cell biology, cell membrane, cell cycle, cell division, cell structure, cell organelles, organelle, organelles,
    mitochondria, mitochondrion, chloroplast, chloroplasts, ribosome, ribosomes, endoplasmic reticulum, golgi apparatus,
    cellular respiration, glycolysis, krebs cycle, citric acid cycle, electron transport chain, atp, photosynthesis, calvin cycle,
    light dependent reactions, mitosis, meiosis, dna, rna, dna replication, transcription and translation, protein synthesis,
    gene expression, genetics, genes, mendelian genetics, punnett square, punnett squares, allele, alleles, genotype, phenotype,
    chromosome, chromosomes, natural selection, evolution by natural selection, darwin, ecology, ecosystem, ecosystems, food web,
    food chain, biome, biomes, population ecology, nitrogen cycle, enzyme, enzymes, enzyme kinetics, amino acids, lipids,
    nucleic acids, homeostasis, immune system, antibodies, antigen, antigens, nervous system, neuron, neurons, action potential,
    synapse, synapses, endocrine system, circulatory system, respiratory system, digestive system, skeletal system, muscular system,
    anatomy, physiology, microbiology, bacteria, prokaryotes, eukaryotes, prokaryotic, eukaryotic, taxonomy, phylogeny,
    phylogenetic tree, cladogram, biodiversity, osmosis, active transport, passive transport, membrane transport, signal transduction,
    biotechnology, pcr, gel electrophoresis, crispr, stem cells, embryology, botany, plant biology, zoology, hardy weinberg`,
  ),
  subject(
    "medicine",
    "medicine and nursing",
    ["biology", "chemistry", "psychology"],
    "nurs, nursing, med, pharm, pharmacology, pathophysiology, patho, nclex, usmle, mcat, kines, kinesiology, pre med",
    `nursing, nclex, usmle, mcat, pharmacology, pathophysiology, pathology, clinical medicine, differential diagnosis, medical school,
    med school, nursing school, cardiology, ecg, ekg, heart sounds, renal physiology, nephron, acid base, fluid and electrolytes,
    electrolytes, drug classes, mechanism of action, antibiotics, cranial nerves, brachial plexus, medical terminology, vital signs,
    patient care, histology, immunology, physical therapy, kinesiology, exercise physiology, osmosis from elsevier`,
  ),
  subject(
    "earth-space",
    "earth and space science",
    ["physics", "chemistry", "biology", "geography"],
    "geol, geology, astr, astro, astronomy, earth science, environmental science, apes, ap environmental science, envs, env sci, oceanography, meteorology",
    `geology, earth science, plate tectonics, tectonic plates, earthquakes, volcano, volcanoes, volcanic, rock cycle, igneous rocks,
    sedimentary rocks, metamorphic rocks, minerals, erosion, weathering and erosion, water cycle, meteorology, weather patterns,
    climate, climate change, greenhouse effect, global warming, atmosphere, ocean currents, oceanography, astronomy, astrophysics,
    cosmology, solar system, planets, black hole, black holes, galaxies, milky way, big bang, stellar evolution, supernova,
    nebula, exoplanet, exoplanets, moon phases, phases of the moon, eclipse, environmental science, sustainability, renewable energy,
    pollution, carbon cycle`,
  ),
  subject(
    "computer-science",
    "computer science",
    ["math", "engineering", "statistics"],
    "cs, cse, cis, cmsc, csci, cpsc, coms, comp sci, compsci, computer science, ap csa, ap csp, ap computer science, informatics",
    `programming, coding, computer science, algorithm, algorithms, data structure, data structures, data structures and algorithms, dsa,
    big o, big o notation, time complexity, recursion, dynamic programming, binary search, binary tree, binary trees, linked list,
    linked lists, hash table, hash tables, hash map, graph algorithms, dijkstra, sorting algorithm, sorting algorithms, merge sort,
    quick sort, quicksort, bubble sort, python, javascript, typescript, java programming, cpp, golang, kotlin, react js, reactjs,
    react hooks, react native, node js, nodejs, html, css, sql, database, databases, web development, web dev, frontend, backend,
    full stack, api, apis, git, github, linux, operating system, operating systems, computer architecture, assembly language,
    compiler, compilers, machine learning, deep learning, neural network, neural networks, artificial intelligence, data science,
    numpy, tensorflow, pytorch, leetcode, coding interview, object oriented programming, oop, functional programming, unit testing,
    debugging, software engineering, cybersecurity, computer networks, tcp ip, cs50, computer vision, natural language processing,
    boolean logic, logic gates, binary numbers, turing machine, automata, regular expressions, regex`,
  ),
  subject(
    "engineering",
    "engineering",
    ["physics", "math", "computer-science"],
    "engr, ece, ee, me, ce, che, electrical engineering, mechanical engineering, civil engineering, chemical engineering, engineering, statics, dynamics",
    `engineering, electrical engineering, mechanical engineering, civil engineering, chemical engineering, circuit analysis,
    electric circuits, op amp, op amps, transistor, transistors, digital logic, signals and systems, control systems, pid controller,
    statics, mechanics of materials, strength of materials, stress and strain, beam deflection, truss, trusses, fluid mechanics,
    heat transfer, solidworks, autocad, arduino, raspberry pi, embedded systems, finite element, fea`,
  ),
  subject(
    "history",
    "history",
    ["government", "geography", "english", "arts"],
    "hist, history, apush, apwh, apeh, ap us history, ap world, ap world history, ap euro, us history, world history, european history",
    `history, historical, world war, world war i, world war 1, world war ii, world war 2, ww1, ww2, wwi, wwii, cold war, civil war,
    american revolution, french revolution, industrial revolution, russian revolution, renaissance, reformation, the enlightenment,
    middle ages, medieval, roman empire, ancient rome, ancient greece, ancient egypt, byzantine empire, ottoman empire, mongol empire,
    british empire, colonialism, imperialism, age of exploration, manifest destiny, reconstruction era, great depression, new deal,
    civil rights movement, holocaust, treaty of versailles, louisiana purchase, declaration of independence, founding fathers,
    silk road, feudalism, crusades, aztec, aztecs, inca, mayan, mesopotamia, dynasty, qing dynasty, ming dynasty, meiji restoration,
    decolonization, vietnam war, korean war, napoleon, abraham lincoln, dbq, leq, historiography, primary source, primary sources,
    hitler, nazi, nazis, nazi germany, third reich, stalin, mussolini, churchill, pearl harbor, d day, normandy landings,
    battle of stalingrad, battle of britain, weimar republic, the blitz, apartheid, partition of india`,
  ),
  subject(
    "government",
    "government and civics",
    ["history", "economics", "geography"],
    "gov, govt, government, ap gov, ap government, poli sci, polisci, pols, psci, civics, political science, ap comparative",
    `government, civics, political science, constitution, bill of rights, amendment, amendments, first amendment, supreme court,
    judicial review, congress, senate, house of representatives, executive branch, legislative branch, judicial branch,
    checks and balances, separation of powers, federalism, federalist papers, federalist 10, electoral college, political parties,
    interest groups, civil liberties, civil rights, due process, public policy, comparative politics, international relations,
    foreign policy, landmark cases, marbury v madison, brown v board, political ideology`,
  ),
  subject(
    "economics",
    "economics and business",
    ["government", "statistics", "math"],
    "econ, economics, ap macro, ap micro, macroeconomics, microeconomics, bus, busi, business, acct, accounting, fin, finance, mktg, marketing, mgmt",
    `economics, economic, macroeconomics, microeconomics, supply and demand, elasticity, price elasticity, opportunity cost,
    comparative advantage, market structures, monopolistic competition, oligopoly, perfect competition, marginal cost,
    marginal revenue, marginal utility, gdp, inflation, monetary policy, fiscal policy, federal reserve, aggregate demand,
    aggregate supply, money supply, phillips curve, game theory, consumer surplus, producer surplus, deadweight loss, externalities,
    price ceiling, price floor, exchange rates, balance of payments, accounting, financial accounting, managerial accounting,
    balance sheet, income statement, cash flow statement, debits and credits, journal entries, corporate finance,
    time value of money, net present value, npv, marketing strategy, business strategy, porters five forces, swot analysis`,
  ),
  subject(
    "english",
    "English and literature",
    ["history", "philosophy"],
    "engl, english, eng, lit, literature, ap lang, ap lit, ap english, writing, rhet, rhetoric, wrt, writ, composition",
    `literature, literary, literary analysis, literary devices, rhetorical analysis, rhetoric, rhetorical devices, essay writing,
    thesis statement, argumentative essay, persuasive essay, how to write an essay, five paragraph essay, english grammar, grammar,
    punctuation, comma rules, parts of speech, poetry, poem, poems, sonnet, sonnets, iambic pentameter, figurative language,
    symbolism, character analysis, plot summary, shakespeare, hamlet, macbeth, romeo and juliet, othello, king lear,
    the great gatsby, gatsby, to kill a mockingbird, george orwell, animal farm, of mice and men, the odyssey, the iliad, beowulf,
    the crucible, pride and prejudice, jane austen, frankenstein, the scarlet letter, lord of the flies, brave new world,
    catcher in the rye, canterbury tales, chaucer, charles dickens, toni morrison, edgar allan poe, emily dickinson, walt whitman,
    sparknotes, close reading, mla format, apa format, creative writing, ap lang, ap lit`,
  ),
  subject(
    "psychology",
    "psychology and sociology",
    ["biology", "statistics", "philosophy", "medicine"],
    "psych, psy, psyc, psychology, ap psych, ap psychology, soc, socio, sociology, anth, anthro, anthropology",
    `psychology, psychological, sociology, sociological, anthropology, cognitive psychology, developmental psychology,
    social psychology, abnormal psychology, classical conditioning, operant conditioning, pavlov, freud, piaget, maslow,
    hierarchy of needs, working memory, long term memory, cognitive dissonance, confirmation bias, cognitive biases,
    nature vs nurture, nature versus nurture, neurotransmitter, neurotransmitters, personality theories, big five personality,
    attachment theory, erikson, psychological disorders, dsm 5, social stratification, socialization`,
  ),
  subject(
    "philosophy",
    "philosophy",
    ["english", "psychology", "history"],
    "phil, philo, philosophy, ethics, logic",
    `philosophy, philosophical, ethics, moral philosophy, metaphysics, epistemology, existentialism, stoicism, utilitarianism, kant,
    kantian, categorical imperative, plato, aristotle, socrates, socratic method, nietzsche, descartes, john locke, social contract,
    free will, trolley problem, philosophy of mind, allegory of the cave, virtue ethics, deontology, formal logic, syllogism,
    logical fallacies`,
  ),
  subject(
    "arts",
    "art and music theory",
    ["history"],
    "art, arth, art history, mus, music, musc, music theory, ap music theory, ap art history, design, dsgn",
    `music theory, ear training, sight reading, chord progression, chord progressions, major scale, minor scale, circle of fifths,
    counterpoint, figured bass, roman numeral analysis, art history, renaissance art, baroque, impressionism, modern art, color theory,
    drawing tutorial, figure drawing, painting tutorial, graphic design, typography`,
  ),
  subject(
    "geography",
    "geography",
    ["history", "government", "earth-space"],
    "geog, geography, ap human geography, aphg, human geography",
    `geography, human geography, physical geography, population pyramid, demographic transition, urbanization, map projections,
    latitude and longitude, von thunen, gravity model, rostow, central place theory, cultural diffusion`,
  ),
  subject("spanish", "Spanish", [], "span, spa, spn, spanish, ap spanish", "spanish, espanol, castellano, dele"),
  subject("french", "French", [], "fren, fre, french, ap french", "french, francais, delf"),
  subject("german", "German", [], "germ, ger, german, ap german", "german, deutsch"),
  subject("japanese", "Japanese", [], "jpn, japn, japanese, ap japanese", "japanese, nihongo, hiragana, katakana, kanji, jlpt"),
  subject("chinese", "Chinese", [], "chin, chn, chinese, mandarin, ap chinese", "chinese, mandarin, cantonese, putonghua, pinyin, hsk"),
  subject("korean", "Korean", [], "kor, korean", "korean, hangul, topik"),
  subject("latin", "Latin", [], "latn, lat, latin, ap latin", "latin language, learn latin, latin grammar, latin declensions"),
  subject("italian", "Italian", [], "ital, ita, italian", "italian, italiano"),
  subject("arabic", "Arabic", [], "arab, arabic", "arabic"),
  subject("portuguese", "Portuguese", [], "port, portuguese", "portuguese, portugues"),
  subject("russian", "Russian", [], "russ, rus, russian", "russian"),
  subject("sign-language", "sign language", [], "asl, sign language", "asl, american sign language, sign language"),
];

export const SUBJECT_BY_ID: ReadonlyMap<SubjectId, SubjectGroup> = new Map(SUBJECTS.map((s) => [s.id, s]));

/** Language-learning words that say "lesson" whichever language is named. */
export const LANGUAGE_LESSON = phrases(
  `learn, learning, lesson, lessons, conjugation, verb conjugation, vocabulary, pronunciation, listening practice, comprehensible input,
  subjunctive, preterite, for beginners, phrases, speaking practice`,
);

// ---------------------------------------------------------------------------
// Kinds of video

/** Background audio for studying. */
export const STUDY_AUDIO = phrases(
  `lofi, lo fi, lofi hip hop, study music, music for studying, music to study, study with me, focus music, deep focus,
  concentration music, white noise, brown noise, pink noise, rain sounds, rain ambience, coffee shop ambience, cafe ambience,
  library ambience, fireplace sounds, pomodoro, ambient study, classical music for studying, piano for studying, beats to study,
  study beats, binaural beats, alpha waves, chillhop, jazz for studying, for studying, to study to, for sleep and study,
  background music for studying, study ambience`,
);
/** "10 hours of rain", "3 hours of piano": long background audio. */
export const STUDY_AUDIO_PATTERN = /\b(\d+|one|two|three|eight|ten|twelve) (hours?|hrs?) (of )?(\w+ )?(rain|music|ambience|ambient|noise|piano|jazz|lofi|sounds?|beats|thunderstorm|ocean waves)\b/;
/** A year before 1990 in a title ("The Fall of Berlin 1945") usually means history. */
export const HISTORY_YEAR = /\b1(?:[0-8]\d\d|9[0-8]\d)\b/;

/** Words that say "this teaches something". */
export const LESSON = phrases(
  `lecture, lectures, lesson, lessons, tutorial, tutorials, explained, explanation, explaining, how to solve, introduction to,
  intro to, crash course, full course, online course, worked example, worked examples, example problem, example problems,
  practice problem, practice problems, practice questions, solved problems, solved example, step by step, for beginners, made easy,
  simplified, exam review, test review, final review, final exam review, midterm review, unit review, ap review, review session,
  study guide, exam prep, test prep, revision, masterclass, seminar, workshop, derivation, homework help, professor, university,
  khan academy, opencourseware, ocw, mcat, sat prep, lsat, gre prep, gmat, nclex, usmle`,
);
/** "… in 10 minutes": a short explainer. */
export const LESSON_PATTERN = /\bin (\d+|one|two|three|five|ten|fifteen|twenty) (minutes?|mins?|seconds?)\b/;

export interface DistractionGroup {
  id: string;
  /** For reasons: "This looks like gaming." */
  name: string;
  phrases: string[];
}

const distraction = (id: string, name: string, list: string): DistractionGroup => ({ id, name, phrases: phrases(list) });

/** Kinds of video that aren't study, whatever the subject. Checked against the title. */
export const DISTRACTIONS: readonly DistractionGroup[] = [
  distraction(
    "gaming",
    "gaming",
    `gameplay, lets play, game walkthrough, full walkthrough, playthrough, speedrun, speed run, minecraft, fortnite, roblox, gta,
    gta 5, gta v, valorant, league of legends, call of duty, warzone, apex legends, overwatch, among us, pokemon, zelda, mario kart,
    super mario, elden ring, genshin impact, the sims, sims 4, stardew valley, terraria, skyrim, counter strike, csgo, cs2,
    rocket league, clash royale, clash of clans, brawl stars, gaming, gamer, esports, funny moments, rage quit, noob vs pro, modded`,
  ),
  distraction(
    "reaction",
    "a reaction or commentary video",
    `reacts to, reacting to, react to, reaction video, reaction videos, my reaction, first time hearing, first time watching,
    commentary, responds to, responding to, youtube drama, exposed, the downfall of, callout`,
  ),
  distraction(
    "comedy",
    "comedy, pranks or challenges",
    `prank, pranks, pranked, funny, funniest, meme, memes, try not to laugh, fails, fail compilation, skit, sketch comedy,
    stand up comedy, standup, comedy special, comedy sketch, roast, parody, last to leave, i survived, 100 days, 24 hours in, challenge`,
  ),
  distraction(
    "lifestyle",
    "a vlog or lifestyle video",
    `vlog, vlogs, day in my life, a day in my life, day in the life, grwm, get ready with me, haul, what i eat in a day,
    morning routine, night routine, room tour, apartment tour, house tour, storytime, story time, mukbang, asmr,
    makeup tutorial, makeup look, makeup routine, skincare, outfit, outfits, fashion, lookbook, travel vlog`,
  ),
  distraction(
    "music",
    "a music video",
    `official music video, music video, official video, official audio, lyric video, lyrics, live performance, live at, concert,
    full album, remix, nightcore, slowed and reverb, slowed reverb, sped up, mv, kpop, k pop, dance practice, choreography,
    song, songs, cover`,
  ),
  distraction(
    "screen",
    "TV, film or anime",
    `trailer, official trailer, teaser, full movie, movie, movies, full episode, new episode, season finale, new season, netflix,
    behind the scenes, bloopers, deleted scenes, ending explained, lore, fan theory, movie recap, episode recap, series recap, anime,
    amv, edits, fancam, fan cam, cartoon, spongebob, the simpsons, family guy, marvel, star wars`,
  ),
  distraction(
    "sports",
    "sports",
    `highlights, full match, match highlights, game highlights, all goals, goals and highlights, nba, nfl, mlb, nhl, premier league,
    champions league, world cup, ufc, wwe, boxing, f1 race, f1 highlights, formula 1, super bowl`,
  ),
  distraction("shopping", "shopping or gadget reviews", `unboxing, first impressions, tier list, ranking every, rating every, worth it, iphone, setup tour, best budget`),
  distraction("celebrity", "celebrity news or gossip", `gossip, celebrity, celebrities, tmz, breaking news, live news`),
  distraction("food", "cooking or food", `recipe, recipes, cooking, cooks, taste test, food review, street food, what i eat, eating only`),
  distraction(
    "clips",
    "clips, Shorts or streams",
    `shorts, tiktok, tiktoks, compilation, satisfying, oddly satisfying, clips, livestream, live stream, stream highlights, vod`,
  ),
];

// ---------------------------------------------------------------------------
// Channels (by normalized display name)

export type ChannelKind = "lesson" | "edutainment" | "entertainment";

export interface ChannelInfo {
  kind: ChannelKind;
  /** Empty for channels that teach everything (the title says which subject). */
  subjects: SubjectId[];
}

const channels = (kind: ChannelKind, entries: Record<string, SubjectId[]>): [string, ChannelInfo][] =>
  Object.entries(entries).map(([name, subjects]) => [normalize(name), { kind, subjects }]);

export const CHANNELS: ReadonlyMap<string, ChannelInfo> = new Map([
  ...channels("lesson", {
    "Khan Academy": [],
    CrashCourse: [],
    "MIT OpenCourseWare": [],
    "Stanford Online": [],
    "Yale Courses": [],
    "Harvard University": [],
    "Professor Dave Explains": [],
    Magoosh: [],
    Kaplan: [],
    "The Princeton Review": [],
    "The Organic Chemistry Tutor": ["math", "chemistry", "physics"],
    "3Blue1Brown": ["math"],
    "Professor Leonard": ["math"],
    patrickJMT: ["math"],
    "Eddie Woo": ["math"],
    blackpenredpen: ["math"],
    "Dr. Trefor Bazett": ["math"],
    Mathologer: ["math"],
    "Michel van Biezen": ["physics", "math", "engineering"],
    "Flipping Physics": ["physics"],
    "Physics Ninja": ["physics"],
    APlusPhysics: ["physics"],
    "Doc Schuster": ["physics"],
    "PBS Space Time": ["physics", "earth-space"],
    "Amoeba Sisters": ["biology"],
    "Bozeman Science": ["biology", "chemistry", "physics", "earth-space"],
    "Ninja Nerd": ["biology", "medicine"],
    "Osmosis from Elsevier": ["medicine", "biology"],
    Osmosis: ["medicine", "biology"],
    "Armando Hasudungan": ["medicine", "biology"],
    "Dr Matt & Dr Mike": ["medicine", "biology"],
    RegisteredNurseRN: ["medicine"],
    SimpleNursing: ["medicine"],
    "Speed Pharmacology": ["medicine"],
    "Tyler DeWitt": ["chemistry"],
    Leah4sci: ["chemistry"],
    "Melissa Maribel": ["chemistry"],
    "Chad's Prep": ["chemistry", "biology"],
    "Wayne Breslyn": ["chemistry"],
    "Jeremy Krug": ["chemistry"],
    "Mark Rosengarten": ["chemistry"],
    "Heimler's History": ["history", "government"],
    "Tom Richey": ["history", "government"],
    "Hip Hughes": ["history", "government"],
    "Kings and Generals": ["history"],
    "Epic History TV": ["history"],
    "Mr. Beat": ["history", "government"],
    "Jacob Clifford": ["economics"],
    "ACDC Econ": ["economics"],
    "Marginal Revolution University": ["economics"],
    "freeCodeCamp.org": ["computer-science"],
    CS50: ["computer-science"],
    "Traversy Media": ["computer-science"],
    "Web Dev Simplified": ["computer-science"],
    "The Coding Train": ["computer-science"],
    NeetCode: ["computer-science"],
    "Abdul Bari": ["computer-science"],
    mycodeschool: ["computer-science"],
    "Corey Schafer": ["computer-science"],
    "Tech With Tim": ["computer-science"],
    "Programming with Mosh": ["computer-science"],
    "Bro Code": ["computer-science"],
    "Kevin Powell": ["computer-science"],
    sentdex: ["computer-science"],
    "Andrej Karpathy": ["computer-science"],
    "Ben Eater": ["computer-science", "engineering"],
    "StatQuest with Josh Starmer": ["statistics", "computer-science"],
    "The Efficient Engineer": ["engineering"],
    Lesics: ["engineering"],
    "Wireless Philosophy": ["philosophy"],
    SparkNotes: ["english"],
    "Easy Spanish": ["spanish"],
    "Dreaming Spanish": ["spanish"],
    "Butterfly Spanish": ["spanish"],
    "Easy French": ["french"],
    "Easy German": ["german"],
    "Easy Italian": ["italian"],
    "Easy Japanese": ["japanese"],
    "Easy Mandarin": ["chinese"],
    "Easy Korean": ["korean"],
  }),
  ...channels("edutainment", {
    "Kurzgesagt – In a Nutshell": ["biology", "physics", "earth-space"],
    Veritasium: ["physics", "math"],
    Vsauce: [],
    Vsauce2: ["math"],
    "Tom Scott": [],
    "CGP Grey": ["government", "history"],
    OverSimplified: ["history"],
    "Extra History": ["history"],
    "Simple History": ["history"],
    "Mark Rober": ["engineering", "physics"],
    SmarterEveryDay: ["physics", "engineering"],
    TED: [],
    "TED-Ed": [],
    "TEDx Talks": [],
    SciShow: ["biology", "chemistry", "physics", "earth-space"],
    minutephysics: ["physics"],
    "Physics Girl": ["physics"],
    Numberphile: ["math"],
    Computerphile: ["computer-science"],
    "Stand-up Maths": ["math"],
    "It's Okay To Be Smart": ["biology", "physics", "earth-space"],
    "PBS Eons": ["biology", "earth-space"],
    "Real Engineering": ["engineering"],
    "Practical Engineering": ["engineering"],
    "The Infographics Show": [],
    "Johnny Harris": ["geography", "government", "history"],
    "Wendover Productions": ["geography", "economics"],
    "Half as Interesting": [],
    PolyMatter: ["economics", "government"],
    "Economics Explained": ["economics"],
    "The School of Life": ["philosophy", "psychology"],
    "Philosophy Tube": ["philosophy"],
    Fireship: ["computer-science"],
  }),
  ...channels("entertainment", {
    MrBeast: [],
    "MrBeast Gaming": [],
    "Beast Reacts": [],
    PewDiePie: [],
    Markiplier: [],
    jacksepticeye: [],
    Dream: [],
    Sidemen: [],
    "More Sidemen": [],
    "Dude Perfect": [],
    Smosh: [],
    "Good Mythical Morning": [],
    "First We Feast": [],
    penguinz0: [],
    Ludwig: [],
    xQc: [],
    "Kai Cenat": [],
    IShowSpeed: [],
    SSSniperWolf: [],
    "Ryan Trahan": [],
    Airrack: [],
    ZHC: [],
    Unspeakable: [],
    DanTDM: [],
    Technoblade: [],
    GeorgeNotFound: [],
    KSI: [],
    "Logan Paul": [],
    "Jake Paul": [],
    "Danny Gonzalez": [],
    "Drew Gooden": [],
    "Kurtis Conner": [],
    "Cody Ko": [],
    "The Game Theorists": [],
    "The Film Theorists": [],
    "The Food Theorists": [],
    "Linus Tech Tips": [],
    "Marques Brownlee": [],
    "The Tonight Show Starring Jimmy Fallon": [],
    "Jimmy Kimmel Live": [],
    "Saturday Night Live": [],
    Netflix: [],
    "Marvel Entertainment": [],
    "HBO Max": [],
    ESPN: [],
    NBA: [],
    NFL: [],
    "House of Highlights": [],
    "Bleacher Report": [],
    WWE: [],
    UFC: [],
    CoComelon: [],
    "Ryan's World": [],
  }),
]);

// ---------------------------------------------------------------------------
// YouTube's own categories (the "genre" a watch page carries, when it does)

export type CategoryLean = "lesson" | "distraction" | "neutral";

/** Uploads default to People & Blogs, so that one says nothing. */
export const YOUTUBE_CATEGORIES: Readonly<Record<string, CategoryLean>> = {
  education: "lesson",
  "science and technology": "lesson",
  gaming: "distraction",
  comedy: "distraction",
  music: "distraction",
  sports: "distraction",
  "film and animation": "distraction",
  entertainment: "distraction",
  "pets and animals": "distraction",
  "autos and vehicles": "distraction",
  "travel and events": "distraction",
  "people and blogs": "neutral",
  "howto and style": "neutral",
  "news and politics": "neutral",
  "nonprofits and activism": "neutral",
};
