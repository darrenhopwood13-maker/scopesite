# Scope Navigator

> **Schema source of truth:** `db/schema.sql` is currently the authoritative schema for this repo. It was generated from the live Supabase catalogue after the migration tool became unavailable in this session. When the migration tool is restored, `db/schema.sql` must be replayed through it so `supabase/migrations/` becomes the source of truth again. Do not assume migrations exist until that is done.

ScopeGuard — Complete Project Brief

For: Lovable planning agent Product: Scope gap and trade allocation analysis for UK construction drawings Suite: instructSite. Standalone product, later an instructSiteEnterprise add-on. Version: 2.0 — architecture validated against real project drawings

1. What this product does

A user uploads a construction drawing. The app reads it and returns:

Deferrals — every place the drawing hands responsibility to someone else ("by others", "by specialist", "indicative only", "to be confirmed")

Trade allocation — every annotated item allocated to a trade package

Contested interfaces — items where two or more trades could legitimately own it

Coverage gaps — trades that should appear on this drawing type but have no items

Cross-document corroboration — where two drawings defer the same interface, neither package owns it

Output is an evidence-cited register, correctable by the user, exportable to Excel.

The problem it solves

On a large project, scope falls between packages. The drawing says "by specialist". The subcontract says "excluded". Nobody notices until it becomes a variation eight months later. The information was always there, printed on the drawings, unread.

2. Evidence base — this architecture is validated, not theoretical

Two real drawings from the Grafton Street project were tested before this brief was written.

Drawing A — Veretec GST-VER-0700-CL-5T6-DE-A-2746 Rev P01

Facade detail at stair core. Status S5, For Review and Acceptance.

PDF layers: none. Zero optional content groups.

Vector text: 193 spans with exact coordinates. Clean, free, no OCR.

System reference codes present: EWS-402, EWS-701, EWS-710, IWS-202, FPS-103, FPS-204 — the project's own system register, printed on the drawing.

Red text flags a live issue: "SFS PROPOSAL TO BE REVIEWED WITH CLADDING SPECIALIST. IN ABEYANCE"

Cue matching produced 26 clear, 17 contested allocations. The contested list correctly identified the cavity barrier, secondary steel, beam encasement and waterproofing upstand interfaces.

Drawing B — Foster + Partners GST-FSP-0978-XX-L30-SC-A-0002 Rev 02

Third Floor IWS Scope Plan. Stage 4 Rev 02.

PDF layers: none. Different consultant, same result.

Drawing body contains almost no text — 46,065 vector paths, and only grid references and the view title. The scope is drawn, not written.

The general notes block contained nine scope-relevant claims, including four explicit deferrals.

The finding that defines the product

These two drawings corroborate each other:

Foster + Partners, general note 14: "Fire protection of primary structure and façade elements interfaces subject to review by appointed fire specialist."

Veretec sheet 2746, red text: "SFS proposal to be reviewed with cladding specialist. In abeyance."

The architect left the façade/fire interface open. The façade consultant left their proposal in abeyance. The same sheet shows Siderise cavity barriers, four-sided Promat beam encasement and fire seals at head of wall — the exact junction. No package owns it. Both drawings are issued for review.

That gap was found from two PDFs in under two minutes.

Architectural conclusions

Finding Consequence No layers on either drawing, two different consultants Layers are an opportunistic bonus, never a foundation Vector text is clean and free Text extraction is Stage 1, no vision needed for most sheets General notes carry dense deferral claims Notes extraction is the highest-yield feature. Build it first. System codes (EWS/IWS/FPS) are a project taxonomy Code prefix parsing beats keyword guessing One sheet had no readable annotation at all Sheet triage is mandatory. Say so honestly. Red text marked an unresolved item Colour is a first-class signal

3. Invariants — never violate these

Verbatim evidence only. Every finding stores the exact text from the drawing. Never paraphrased, never reconstructed.

No citation, no finding. Drawing number, revision, and page coordinates or note number. A finding without evidence must not render.

Contested is a correct answer. Never collapse two candidate trades into one to appear confident.

Two tiers only. confirmed and possible. Never show a raw confidence percentage to a user.

Honest triage. If a sheet has no readable annotation, say so. Never generate findings from an empty extraction.

Every allocation is overridable, and every override is stored as training data.

Never fabricate a drawing number, revision, trade, standard, clause or party name.

No design advice. The app reports what the documents say and who might own it. It never says what should be built.

Advisory disclaimer on every findings screen and every export.

Superseded revisions are never deleted.

4. User journey

Sign in (magic link)
  → Create or open a project
  → Upload drawings (one or many PDFs)
  → Each drawing: extract → triage → analyse
  → Review findings
      Deferrals | Contested | Clear | Unclaimed | Coverage
  → Correct any allocation
  → Cross-document view: corroborated deferrals across drawings
  → Export register to Excel


A project is a lightweight container — name, client, reference. No zone register, no package register in v1.

5. Data model

5.1 Reference tables (seeded, read-only to users)

create table disciplines (
  code text primary key,
  name text not null
);

create table trades (
  id                     uuid primary key default gen_random_uuid(),
  code                   text unique not null,
  name                   text not null,
  discipline_code        text references disciplines(code),
  typical_drawing_types  text[],
  sort_order             int not null default 0,
  active                 boolean not null default true
);

create table trade_cues (
  id       uuid primary key default gen_random_uuid(),
  trade_id uuid not null references trades(id) on delete cascade,
  cue_type text not null,      -- keyword | abbreviation | system_prefix
  pattern  text not null,
  weight   numeric not null default 0.7
);
create index on trade_cues (cue_type);

-- Deferral patterns. Highest yield feature in the product.
create table deferral_patterns (
  id           uuid primary key default gen_random_uuid(),
  claim_type   text not null,   -- by_others | design_deferral
                                -- | scope_boundary | performance_req
                                -- | hold_status
  pattern      text not null,   -- case-insensitive regex
  severity     text not null,
  guidance     text not null
);

-- Project system-code prefixes (EWS/IWS/FPS style). Seeded with common
-- UK conventions, extendable per project.
create table system_code_prefixes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade, -- null = global
  prefix      text not null,          -- 'EWS'
  meaning     text not null,          -- 'External Wall System'
  trade_id    uuid references trades(id),
  confidence  numeric not null default 0.9
);

-- Interface rules. The IP of the product.
create table interface_rules (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  trigger_terms text[] not null,
  context_terms text[],
  trade_codes   text[] not null,   -- always two or more
  severity      text not null,
  guidance      text not null
);


5.2 User data

create table projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id),
  name       text not null,
  reference  text,
  client     text,
  created_at timestamptz not null default now()
);

create table drawings (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  user_id         uuid not null references auth.users(id),
  file_path       text not null,
  file_hash       text not null,
  original_name   text not null,

  drawing_number  text,
  revision        text,
  revision_date   date,
  title           text,
  scale           text,
  originator      text,          -- 'Veretec', 'Foster + Partners'
  discipline_code text references disciplines(code),
  drawing_type    text,          -- detail | GA | RCP | section | scope_plan
                                 -- | elevation | schedule
  status_code     text,          -- S2 | S4 | S5 | A1 | P01

  -- triage
  triage_class    text,          -- annotation_rich | notes_only
                                 -- | graphical_only | unreadable
  text_span_count int,
  body_text_count int,
  path_count      int,
  layers_present  boolean not null default false,
  layer_names     text[],

  status          text not null default 'pending',
                                 -- pending | extracting | analysed | failed
  error           text,
  created_at      timestamptz not null default now()
);
create index on drawings (project_id, created_at desc);
create index on drawings (file_hash);

create table drawing_items (
  id            uuid primary key default gen_random_uuid(),
  drawing_id    uuid not null references drawings(id) on delete cascade,

  raw_text      text not null,        -- verbatim
  source_region text not null,        -- body | notes | titleblock | legend
  bbox          jsonb,
  text_colour   text,                 -- hex, e.g. 'ff0000'
  system_code   text,                 -- 'EWS-701' if present

  item_class    text not null,        -- allocation | deferral
                                      -- | performance_req | annotation_only

  -- allocation
  allocation    text,                 -- clear | contested | unclaimed
  primary_trade_id     uuid references trades(id),
  candidate_trade_ids  uuid[],
  interface_rule_id    uuid references interface_rules(id),

  -- deferral
  deferral_type text,                 -- by_others | design_deferral
                                      -- | scope_boundary | hold_status
  deferred_to   text,                 -- 'appointed fire specialist'

  severity      text,                 -- high | medium | low
  confidence    numeric not null,
  tier          text not null,        -- confirmed | possible
  method        text not null,        -- system_code | notes_pattern
                                      -- | cue | interface_rule | colour | ai
  reasoning     text,

  user_trade_id uuid references trades(id),
  user_status   text,                 -- accepted | corrected | dismissed
  user_note     text,
  corrected_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index on drawing_items (drawing_id, item_class, allocation);
create index on drawing_items (drawing_id, severity);

create table drawing_coverage (
  drawing_id uuid references drawings(id) on delete cascade,
  trade_id   uuid references trades(id),
  expected   boolean not null,
  item_count int not null default 0,
  primary key (drawing_id, trade_id)
);

-- Cross-document corroboration
create table corroborations (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  topic       text not null,          -- 'facade / fire interface'
  item_ids    uuid[] not null,        -- two or more drawing_items
  severity    text not null default 'high',
  narrative   text not null,
  status      text not null default 'open',
  created_at  timestamptz not null default now()
);


5.3 RLS

Every user table scoped to auth.uid(). Reference tables readable by any authenticated user, writable by none.

alter table projects enable row level security;
create policy projects_own on projects
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table drawings enable row level security;
create policy drawings_own on drawings
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table drawing_items enable row level security;
create policy items_own on drawing_items using (
  exists (select 1 from drawings d
          where d.id = drawing_id and d.user_id = auth.uid())
);


6. Seed data

6.1 Disciplines

insert into disciplines (code, name) values
  ('A','Architectural'), ('S','Structural'), ('M','Mechanical'),
  ('E','Electrical'), ('P','Public Health'), ('FP','Fire Protection'),
  ('C','Civil / External'), ('L','Landscape'), ('T','Telecoms / Data'),
  ('X','Multi-discipline / Unassigned');


6.2 Trades

insert into trades (code, name, discipline_code, typical_drawing_types, sort_order) values
('DEMO','Demolition & Strip Out','A','{GA,demolition_plan}',10),
('GRND','Groundworks & Substructure','C','{GA,section}',20),
('CONC','Concrete Frame','S','{GA,section,detail}',30),
('STEE','Structural Steelwork','S','{section,detail,framing_plan}',40),
('MASO','Masonry & Blockwork','A','{GA,section,detail}',50),
('ROOF','Roofing & Waterproofing','A','{roof_plan,section,detail}',60),
('CLAD','Cladding & Rainscreen','A','{elevation,section,detail}',70),
('CWAL','Curtain Walling & Windows','A','{elevation,section,detail}',80),
('EXTM','Architectural Metalwork & Balustrades','A','{GA,detail}',90),
('DRYL','Drylining, Partitions & Ceilings','A','{GA,RCP,detail,scope_plan}',100),
('CEIL','Suspended Ceilings','A','{RCP,detail}',110),
('RAFL','Raised Access Floors','A','{GA,section}',120),
('SCRD','Screeds & Floor Preparation','A','{section,detail}',130),
('DOOR','Doors, Frames & Ironmongery','A','{GA,schedule,detail}',140),
('GLAZ','Internal Glazing & Glazed Partitions','A','{GA,detail}',150),
('JOIN','Joinery & Second Fix Carpentry','A','{GA,detail,elevation}',160),
('FSTP','Fire Stopping & Compartmentation','FP','{GA,RCP,detail,section}',170),
('INSU','Thermal & Acoustic Insulation','A','{section,detail}',180),
('FLOR','Floor Finishes','A','{GA,finishes_plan}',190),
('WALL','Wall Finishes & Decoration','A','{GA,elevation}',200),
('SANI','Sanitaryware & Washroom Systems','P','{GA,detail}',210),
('SIGN','Signage & Wayfinding','A','{GA,elevation}',220),
('FFE','Loose Furniture & FF&E','A','{GA,furniture_plan}',230),
('MECH','Mechanical Services (HVAC)','M','{GA,RCP,services_plan}',240),
('ELEC','Electrical Services','E','{GA,RCP,services_plan}',250),
('PBHL','Public Health & Above-ground Drainage','P','{GA,services_plan,section}',260),
('SPRK','Sprinklers & Fire Suppression','FP','{RCP,services_plan}',270),
('FALM','Fire Alarm & Detection','FP','{RCP,services_plan}',280),
('SECU','Security, Access Control & CCTV','T','{GA,RCP,services_plan}',290),
('DATA','Data, Comms & Containment','T','{GA,RCP,services_plan}',300),
('BMS','BMS & Controls','M','{services_plan,schematic}',310),
('LIFT','Lifts & Vertical Transportation','M','{GA,section}',320),
('BWIC','Builders Work in Connection','X','{GA,section,detail}',330),
('EXTW','External Works & Landscaping','L','{site_plan,GA}',340);


6.3 Deferral patterns — build this first

insert into deferral_patterns (claim_type, pattern, severity, guidance) values

('by_others','\bby others\b','high',
 'Responsibility passed to an unnamed party. Confirm which package carries this scope.'),
('by_others','\bby (a |an )?(appointed |nominated )?(specialist|sub-?contractor)\b','high',
 'Deferred to a specialist. Confirm the specialist is appointed and their scope covers this item.'),
('by_others','\bsubject to review by\b','high',
 'Design review outstanding. Until closed, no package owns this item.'),
('by_others','\bto be (defined|determined|designed|confirmed) by\b','high',
 'Design responsibility deferred to a named party. Confirm they are appointed and the item is in their scope.'),
('by_others','\brefer to .{0,40}(consultant|designer|specialist|architect|engineer)','medium',
 'Information held elsewhere. Confirm the referenced document exists and is current.'),
('by_others','\bnot in contract\b|\bN\.?I\.?C\.?\b','high',
 'Explicitly excluded. Confirm another package picks it up.'),
('by_others','\bby (the )?(client|tenant|landlord|employer)\b','medium',
 'Client-side scope. Confirm the boundary is recorded in the demarcation schedule.'),

('design_deferral','\bindicative only\b','high',
 'Design not fixed. Anything priced against this is at risk of change.'),
('design_deferral','\bsubject to (tenant |detailed )?(fit ?out|design development)\b','medium',
 'Scope will change. Confirm the change control route.'),
('design_deferral','\bto be confirmed\b|\bT\.?B\.?C\.?\b','medium',
 'Unresolved. Track to closure before the package is let.'),
('design_deferral','\bprovisional\b','medium',
 'Provisional item. Confirm it is defined before its programme date.'),

('scope_boundary','\bdemarcation\b','high',
 'Scope boundary defined in a separate document. Confirm that document is agreed and current.'),
('scope_boundary','\bbase build scope\b|\bcategory ?a\b|\bcat ?a\b','medium',
 'Base build versus fit-out boundary. Confirm which side of the line this sits.'),

('performance_req','\bshould (be provided|have|achieve)\b','medium',
 'Performance requirement with no named provider. Confirm which package delivers it.'),
('performance_req','\b(E|EI|REI) ?\d{2,3}\b','medium',
 'Fire performance requirement stated. Confirm the specified system achieves it and who installs it.'),
('performance_req','\brefer to .{0,30}(fire safety strategy|strategy report)','medium',
 'Requirement held in the fire strategy. Confirm the detail on site matches it.'),

('hold_status','\bin abeyance\b','high',
 'Item formally on hold. Nothing downstream can be relied upon until it is released.'),
('hold_status','\bon hold\b|\bnot for construction\b|\bpreliminary\b','high',
 'Status flag. Confirm the current issue status before pricing or building.'),
('hold_status','\bto be reviewed with\b','high',
 'Open review item. Confirm the review has taken place and the outcome is issued.');


6.4 System code prefixes

insert into system_code_prefixes (project_id, prefix, meaning, trade_id, confidence)
select null, v.p, v.m, t.id, v.c from (values
  ('EWS','External Wall System','CLAD',0.90),
  ('IWS','Internal Wall System','DRYL',0.90),
  ('FPS','Fire Protection System','FSTP',0.90),
  ('RFS','Roof System','ROOF',0.90),
  ('FLS','Floor System','FLOR',0.85),
  ('CLS','Ceiling System','CEIL',0.85),
  ('DRS','Door System','DOOR',0.90),
  ('GLS','Glazing System','GLAZ',0.85),
  ('BAL','Balustrade System','EXTM',0.85),
  ('SFS','Steel Framing System','CLAD',0.80)
) as v(p,m,tc,c) join trades t on t.code = v.tc;


Users can add project-specific prefixes. Every project has its own register.

6.5 Trade cues

Seed the cue list from the validated set. Abbreviated here; the full list follows the same shape.

insert into trade_cues (trade_id, cue_type, pattern, weight)
select t.id, v.ct, v.pat, v.w from (values

('CLAD','keyword','rainscreen',0.95),('CLAD','keyword','cladding',0.90),
('CLAD','keyword','facade mounting bracket',0.95),('CLAD','keyword','precast',0.80),
('CLAD','keyword','sheathing board',0.80),('CLAD','keyword','breather membrane',0.80),
('CLAD','keyword','light gauge metal framing',0.85),('CLAD','abbreviation','SFS',0.70),

('ROOF','keyword','waterproofing',0.90),('ROOF','abbreviation','PMMA',0.95),
('ROOF','keyword','gutter',0.90),('ROOF','keyword','upstand',0.85),
('ROOF','abbreviation','EPDM',0.90),('ROOF','keyword','flashing',0.85),
('ROOF','keyword','sarking',0.85),('ROOF','keyword','roof deck',0.85),

('FSTP','keyword','fire stopping',0.98),('FSTP','keyword','firestop',0.98),
('FSTP','keyword','cavity barrier',0.95),('FSTP','keyword','fire seal',0.95),
('FSTP','keyword','fire collar',0.95),('FSTP','keyword','intumescent',0.90),
('FSTP','keyword','beam encasement',0.85),('FSTP','keyword','penetration',0.85),
('FSTP','keyword','fire batt',0.95),

('DRYL','keyword','plasterboard',0.95),('DRYL','keyword','metal stud',0.95),
('DRYL','keyword','shaft wall',0.90),('DRYL','keyword','deflection head',0.90),
('DRYL','abbreviation','MF',0.60),('DRYL','keyword','partition',0.75),
('DRYL','keyword','liner wall',0.85),

('STEE','keyword','secondary steel',0.95),('STEE','keyword','steel structure',0.90),
('STEE','keyword','base plate',0.85),('STEE','abbreviation','SHS',0.75),

('INSU','keyword','mineral wool',0.90),('INSU','keyword','insulation',0.85),
('INSU','keyword','thermal break',0.85),

('MECH','abbreviation','LTHW',0.95),('MECH','abbreviation','CHW',0.95),
('MECH','abbreviation','AHU',0.95),('MECH','abbreviation','FCU',0.95),
('MECH','keyword','ductwork',0.95),('MECH','keyword','diffuser',0.85),
('MECH','keyword','fire damper',0.75),

('ELEC','keyword','containment',0.85),('ELEC','keyword','cable tray',0.95),
('ELEC','keyword','luminaire',0.95),('ELEC','keyword','small power',0.95),
('ELEC','keyword','socket outlet',0.95),('ELEC','keyword','emergency lighting',0.90),

('PBHL','abbreviation','SVP',0.95),('PBHL','abbreviation','RWP',0.95),
('PBHL','keyword','soil pipe',0.95),('PBHL','keyword','gully',0.85),

('SANI','abbreviation','WHB',0.95),('SANI','keyword','cubicle',0.90),
('SANI','keyword','IPS panel',0.95),('SANI','keyword','carrier frame',0.85),

('DOOR','keyword','door set',0.95),('DOOR','keyword','ironmongery',0.95),
('DOOR','abbreviation','FD30',0.85),('DOOR','abbreviation','FD60',0.85),

('JOIN','keyword','worktop',0.90),('JOIN','keyword','tea point',0.90),
('JOIN','keyword','bespoke joinery',0.95),('JOIN','keyword','shadow gap',0.80),

('SPRK','keyword','sprinkler head',0.98),
('FALM','keyword','smoke detector',0.95),('FALM','keyword','call point',0.95),
('SECU','keyword','access control',0.95),('SECU','abbreviation','CCTV',0.95),
('DATA','keyword','floor box',0.85),('DATA','abbreviation','WAP',0.85),

('BWIC','abbreviation','BWIC',0.98),('BWIC','keyword','builders work',0.98),
('BWIC','keyword','forming opening',0.90),('BWIC','keyword','core drill',0.85),
('BWIC','keyword','make good',0.80),('BWIC','keyword','plinth',0.65),

('MASO','keyword','brickwork',0.90),('MASO','keyword','blockwork',0.90)

) as v(tc,ct,pat,w) join trades t on t.code = v.tc;


6.6 Interface rules

insert into interface_rules (name, trigger_terms, context_terms, trade_codes, severity, guidance) values

('Cavity barrier / fire seal at facade junction',
 '{cavity barrier,fire seal,siderise,open state,linear gap seal}',
 '{facade,cladding,slab edge,head of wall,compartment}',
 '{FSTP,CLAD,DRYL}','high',
 'Cavity barriers at the facade zone are routinely excluded by both the cladding and the fire stopping packages. Confirm which package supplies, installs and certifies.'),

('Secondary steel and support brackets to facade',
 '{secondary steel,support bracket,facade mounting bracket,metal angle,ms framing,unistrut}',
 '{facade,cladding,gutter,panel,soffit}',
 '{STEE,CLAD,ROOF}','high',
 'The facade package assumes secondary steel is provided; the steelwork package priced the primary frame only. Confirm who designs, supplies and installs, and who carries the design responsibility.'),

('Beam encasement and fire protection to structure',
 '{beam encasement,encasement,promat,board protection,intumescent coating}',
 '{beam,column,steel,structure}',
 '{FSTP,DRYL,STEE}','high',
 'Board encasement to steel: fire protection specialist or drylining? Confirm who closes the gap between the encasement and the adjoining wall.'),

('Waterproofing upstands and terminations',
 '{upstand,termination,flashing,cavity tray,dpc,dressed into,dressed down}',
 '{roof,parapet,gutter,threshold,abutment,cladding}',
 '{ROOF,CLAD,MASO}','high',
 'Classic single-point-of-failure interface. Confirm one trade owns continuity of the waterproof line and provides the warranty.'),

('Deflection head at head of wall',
 '{deflection head,head of wall,head detail}',
 '{partition,slab,beam,soffit}',
 '{DRYL,STEE,FSTP}','high',
 'Movement allowance, fire rating and acoustic seal meet at one junction across three packages. Confirm the specified detail is achievable and who installs each component.'),

('Pattress and backing for wall-hung items',
 '{pattress,backing,noggin,plywood backing,timber backing}',
 '{wall-hung,wc,basin,whb,tv,bracket,rail,cistern}',
 '{DRYL,SANI,JOIN,MECH}','high',
 'Drylining commonly excludes the backing; the trade hanging the item assumes it is there. Confirm before partitions are closed.'),

('Fire stopping to service penetrations',
 '{penetration,fire stopping,firestop,fire collar,sleeve}',
 '{duct,pipe,cable,tray,riser,compartment}',
 '{FSTP,MECH,ELEC,PBHL,DRYL}','high',
 'Most commonly excluded by every services package. Confirm a specialist is appointed and their scope covers all disciplines.'),

('Builders work openings, forming and making good',
 '{opening,core drill,chase,cut out,forming opening,make good}',
 '{duct,pipe,cable,wall,slab,beam}',
 '{BWIC,CONC,MASO,MECH,ELEC}','high',
 'Frequently split between forming and making good, and frequently neither is priced. Check against the BWIC schedule.'),

('Access panels in ceilings and walls',
 '{access panel,access hatch,inspection hatch}',
 '{ceiling,bulkhead,riser,valve,damper}',
 '{CEIL,DRYL,MECH,ELEC}','high',
 'Services need the access; the fabric trade forms the opening. Confirm who supplies the panel and to what fire rating.'),

('Final connections to loose and joinery items',
 '{final connection,connect,termination,commission}',
 '{appliance,tea point,worktop,equipment,ff&e,boiling tap}',
 '{MECH,ELEC,PBHL,JOIN,FFE}','high',
 'Services often price to within one metre; joinery and FF&E often exclude connection entirely.'),

('Decoration of exposed services',
 '{paint,decorate,finish}',
 '{exposed,services,duct,pipe,containment,soffit,plant}',
 '{WALL,MECH,ELEC}','medium',
 'Routinely excluded by both the decorator and the services trade. Confirm before access is lost.'),

('Sealants and mastic at junctions',
 '{sealant,mastic,silicone,perimeter seal}',
 '{junction,perimeter,abutment,head of wall,reveal}',
 '{DRYL,WALL,GLAZ,FSTP}','medium',
 'Cosmetic, acoustic or fire seal? Different trades, different products, different test evidence.'),

('Containment for security and data',
 '{containment,conduit,back box,tray,trunking}',
 '{cctv,access control,data,wap,comms,security}',
 '{ELEC,SECU,DATA}','high',
 'The electrical package prices containment for power only; security and data assume it is provided.'),

('Plinths and bases for plant',
 '{plinth,base,housekeeping pad,inertia base}',
 '{ahu,plant,pump,tank,chiller,unit}',
 '{CONC,BWIC,MECH}','medium',
 'Usually assumed by the services package to be a builders work item.'),

('Fire door decoration and frame finishing',
 '{paint,decorate,finish,seal}',
 '{door,frame,fd30,fd60,architrave}',
 '{DOOR,WALL,JOIN}','medium',
 'Confirm the finish does not invalidate the fire certification.');


7. Extraction and analysis pipeline

Runs as a Supabase edge function: POST /analyse-drawing { drawing_id }.

Use pdfjs-dist in Deno for text extraction with coordinates.

Stage 0 — Extract and triage

1.  Fetch PDF from storage. Compute sha256. If a drawing with the same
    hash exists in this project, clone its items and stop.
2.  Extract all text items with bbox, font size and colour.
3.  Extract optional content group names if present (bonus, not required).
4.  Count vector paths.
5.  Classify regions by position:
      right-hand 28% of page width  → notes / titleblock strip
      remainder                     → drawing body
6.  TRIAGE:
      body text items >= 20                    → annotation_rich
      body < 20 and notes text >= 10           → notes_only
      body < 20 and paths > 5000               → graphical_only
      total text < 10                          → unreadable
7.  Write triage_class. If unreadable, set status and stop. Report honestly.


Never generate findings from an empty extraction.

Stage 1 — Line merging

Drawing annotations wrap across lines. Merge before analysing or item counts inflate and cues fail to match.

Merge two text lines into one item when ALL of:
  - left edges within 3pt
  - vertical gap between 0 and 6pt
  - font sizes within 0.3pt
  - same colour

Also merge horizontally adjacent fragments on the same baseline where the
gap is under 2pt (this recovers split system codes such as 'EWS-' + '402').


Validated: without this, EWS-402, EWS-710 and FPS-103 are missed entirely, and wrapped annotations split into meaningless halves.

Stage 2 — Titleblock parse

Parse the bottom-right region. Extract drawing number, revision, date, scale, title, client, originator, purpose of issue.

Drawing number pattern: [A-Z]{2,4}(-[A-Z0-9]{2,6}){3,6} Status codes: S0–S7, A1–A5, P01–P99, C01–C99

If a field is not present, record null. Never guess.

Stage 3 — Deferral detection (build this first)

Run every deferral_patterns regex against all text, notes region included.

For each match, create a drawing_items row with item_class = 'deferral', the verbatim sentence as raw_text, source_region = 'notes' or 'body', and the pattern's severity and guidance.

Extract deferred_to — the named party following the trigger phrase. Where no party is named, set deferred_to = null and raise severity to high.

This stage alone delivers a usable product. It works on every drawing, including sheets with no annotation at all.

Stage 4 — Colour flags

Any text item that is not black or greyscale gets inspected. Red (#FF0000 or near) sets severity = 'high' and deferral_type = 'hold_status'.

Validated: this catches "SFS PROPOSAL TO BE REVIEWED WITH CLADDING SPECIALIST. IN ABEYANCE".

Stage 5 — System code allocation

Match [A-Z]{2,4}-\d{2,4} against system_code_prefixes for the project, then global. On match: allocation = 'clear', method = 'system_code', confidence from the prefix record.

Unrecognised prefixes are surfaced to the user as "New system prefix found: XXX — what does this mean?" and added to the project register on answer. The register learns per project.

Stage 6 — Cue scoring

For each body item not already allocated by system code:

score[trade] = max(weight) over all matching cues
Sort descending.
  top score < 0.4                     → unclaimed
  top two within 0.15 of each other   → contested (score ambiguity)
  otherwise                           → clear


Stage 7 — Interface rules override

Test every body item against interface_rules. A match forces allocation = 'contested' regardless of cue score, attaches the rule's candidate trades, severity and guidance.

Interface rules always win. A confident single allocation on a known interface is a false negative, and false negatives on interfaces are the whole problem.

Stage 8 — AI residual only

Batch all unclaimed body items into a single AI call. Each item is supplied with its five highest-scoring candidate trades. Never send the full trade list.

System prompt:

You are allocating annotation text from a UK construction drawing to trade
packages. You receive items that automated matching could not resolve.

For each item, choose from the supplied shortlist of candidate trades, or
return null. Never invent a trade.

Rules:
- If the item could genuinely belong to two or more trades, return ALL of
  them. A contested allocation is a correct answer, not a failure.
- If the text is a dimension, grid reference, level datum, revision note,
  north point, scale bar or titleblock field, return trade: null and
  is_annotation_only: true.
- Never infer from position on the sheet. Text only.
- confidence reflects how explicit the text is, not how likely you think
  the allocation is.

Return only valid JSON. No prose.


Stage 9 — Coverage

Compare trades whose typical_drawing_types include this drawing_type against trades actually allocated. Report the missing ones as amber.

Stage 10 — Cross-document corroboration

Project-level, runs after each drawing is analysed.

Group deferral items across all drawings in the project by topic keywords
(fire, facade, security, MEP, lighting, tenant fit-out, structure).

Where two or more deferrals from DIFFERENT drawings or DIFFERENT
originators cover the same topic, create a corroboration record with
severity = high.

Narrative template:
  "<Originator A> defers <topic> on <drawing A> Rev <rev>.
   <Originator B> defers the same interface on <drawing B> Rev <rev>.
   No package currently owns this scope."


This is the product's highest-value output. It is what found the Grafton Street façade/fire gap.

8. Screens

8.1 Sign in

Supabase magic link. instructSite branding.

8.2 Projects

List of projects with drawing count and open high-severity finding count. Create project: name, reference, client.

8.3 Project — drawings

Drag-and-drop PDF upload, multiple files. Each row shows drawing number, revision, originator, triage class, status, and counts by severity.

Triage class shown as a plain badge:

Annotation rich — full analysis

Notes only — deferrals found, no allocation possible

Graphical only — no readable annotation on this sheet

Unreadable — no text extracted

8.4 Drawing — findings

The core screen. Five tabs. Deferrals opens by default.

Tab Contents Deferrals Every by-others, hold, indicative-only and boundary item. Severity ordered. Contested Items with two or more candidate trades, with the interface rule guidance inline. Clear Single-trade allocations, grouped by trade. Unclaimed Items no rule matched. Coverage Trades expected on this drawing type with zero items, in amber.

Every row shows verbatim raw_text, the source region, the method that produced it, and a click-through to the page location.

Every row is correctable: change trade, accept, dismiss with a note.

8.5 Project — corroborations

Cross-document view. Each card names the topic, the drawings and originators involved, quotes both pieces of verbatim evidence side by side, and states the narrative. This is the screen to demo.

8.6 Export

Excel workbook:

Sheet 1 Deferrals — Drawing | Rev | Note | Type | Deferred to | Severity | Guidance

Sheet 2 Allocation — Drawing | Item | System code | Trade | Status | Tier | Method

Sheet 3 Contested — Drawing | Item | Candidate trades | Interface rule | Guidance

Sheet 4 Coverage — Drawing | Missing trades

Sheet 5 Corroborations

8.7 Manifest viewer

Read-only. Trades, cues, system prefixes, interface rules. Demonstrates the depth of the rule base in a meeting.

9. Build phases

Phase 1 — Foundation and deferrals

Auth, projects, upload, storage, PDF text extraction, triage, line merging, titleblock parse, deferral detection, colour flags, deferrals screen, Excel export of deferrals.

Acceptance: upload the two Grafton Street drawings. Foster + Partners returns at least seven deferrals including the fire specialist note. Veretec returns the red abeyance note as high severity. Both titleblocks parse correctly. No fabricated findings.

Phase 2 — Allocation

System code parsing, project prefix register with the learning prompt, cue scoring, interface rules, allocation tabs, correction UI.

Acceptance: Veretec sheet returns the cavity barrier, secondary steel, beam encasement and waterproofing upstand items as contested. No contested item collapsed to a single trade.

Phase 3 — Corroboration and coverage

Cross-document grouping, corroborations screen, coverage report, full Excel export.

Acceptance: the two Grafton Street drawings produce a high-severity corroboration on the façade/fire interface, quoting both sources verbatim.

Phase 4 — AI residual

Batched AI allocation of unclaimed items with candidate shortlists.

Acceptance: unclaimed count falls by at least half with no drop in precision on the tabs above.

Phase 5 — Polish

Manifest viewer, multi-drawing batch upload, project dashboard, guided tour, help clips.

10. Worked test case

Both drawings are on the Grafton Street project.

GST-VER-0700-CL-5T6-DE-A-2746 Rev P01 — Veretec — annotation_rich

Expected: titleblock parsed (client McLaren, S5 For Review and Acceptance, 11/06/25). System codes EWS-402, EWS-701, EWS-710, IWS-202, FPS-103, FPS-204 identified. Red abeyance note as high-severity hold. Contested items covering cavity barrier, secondary steel and facade brackets, beam encasement, EPDM and flashing upstands, fire seal, deflection head. Around 26 clear allocations dominated by CLAD, ROOF, FSTP, DRYL, STEE.

GST-FSP-0978-XX-L30-SC-A-0002 Rev 02 — Foster + Partners — notes_only

Expected: triage class notes_only, stated plainly on screen. At least seven deferrals from the general notes, including riser access to tenant fit-out architect, security to appointed security consultant, fire protection of structure and façade interfaces to appointed fire specialist, lighting to specialist designer, landlord–tenant demarcation, MEP indicative only. No allocation attempted from the drawing body.

Corroboration expected:

Foster + Partners defers the fire protection of primary structure and façade element interfaces to an appointed fire specialist on GST-FSP-0978-XX-L30-SC-A-0002 Rev 02. Veretec records the SFS proposal as in abeyance pending review with the cladding specialist on GST-VER-0700-CL-5T6-DE-A-2746 Rev P01, on a sheet showing cavity barriers, beam encasement and fire seals at that junction. No package currently owns this scope.

11. Branding and voice

instructSite suite. Blue, orange, white, dark navy console styling.

Voice: professional, neutral, authoritative, plain English. Verdict first. No personal names, no emojis, no filler. "Programme" not "schedule". "Site" not "field". "Trade" not "crew".

Finding narrative template:

Finding:        <one sentence verdict>
Evidence:       "<verbatim text>"
Source:         <drawing number> Rev <rev>, <region / note number>
Deferred to:    <party or "not named">
Commercial risk: <plain English consequence>
Action:         <what to confirm, and with whom>


Mandatory disclaimer, on every findings screen and every export:

This AI analysis is an advisory tool. Scope allocation must be verified against the executed sub-contract documents by the Commercial Manager or Design Manager before it is relied upon.

12. Out of scope

Not in any phase of this build:

3D clash detection, BIM or IFC ingestion

Cost data, rates, measurement or valuation

Programme integration

Vision or OCR analysis of drawing geometry

Automatic issue of RFIs or emails to subcontractors

Any output described as compliant, approved or certified

This brief is an advisory planning document. Final architectural and commercial decisions must be verified against project requirements before commitment.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://scopesite.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/71f1a9ec-24de-4315-9448-fbae9e7c7136).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
