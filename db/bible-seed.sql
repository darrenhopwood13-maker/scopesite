-- Scope Gap Bible — seeding steps 1 to 4.
-- Reference data only: no schema changes. Idempotent — safe to re-run.
-- 1. trades   2. interface rules (merge, never narrow)   3. deferral language
-- Step 4 (life-safety severity escalation) lives in src/lib/scopeguard/pipeline.ts.

begin;

/* ------------------------------------------------------------------ */
/* 1. Trade register — the ten trades the bible names that we lacked   */
/* ------------------------------------------------------------------ */

insert into trades (code, name, discipline_code, typical_drawing_types, sort_order) values
  ('CIVL','Civil Engineering, Drainage & External Works','C','{site_plan,GA,section}',15),
  ('PAVE','Paving & External Hard Landscaping','C','{site_plan,GA,detail}',18),
  ('TIMB','Timber Frame','S','{GA,section,detail}',45),
  ('WPRF','Waterproofing & Tanking','A','{section,detail}',72),
  ('REND','Render & External Wall Insulation','A','{elevation,section,detail}',75),
  ('ACFL','Acoustic Flooring','A','{GA,section,detail}',185),
  ('TILE','Tiling, Wall & Floor','A','{GA,detail,finishes_plan}',195),
  ('PLAS','Plastering','A','{GA,section,detail}',205),
  ('LTNG','Lighting','E','{RCP,services_plan,elevation}',255),
  ('TMPW','Temporary Works','X','{GA,section,detail}',300)
on conflict (code) do nothing;

/* ------------------------------------------------------------------ */
/* 2a. Existing interface rules — guidance and trades only.            */
/*     Trigger and context terms are NEVER touched: they are tested    */
/*     against the Grafton sheets and must keep firing exactly as now. */
/* ------------------------------------------------------------------ */

update interface_rules set
  trade_codes = array(select distinct unnest(trade_codes || '{CONC}'::text[])),
  guidance = 'Bracket fixing zones and loads are frequently not reconciled with as-built structural tolerances, and movement allowance differs between the facade design and the frame design. Confirm both before fabrication.'
where name = 'Secondary steel and support brackets to facade';

update interface_rules set
  guidance = 'Coping fixing, flashing lap direction and movement joint continuity at the wall-to-roof junction are assumed by both sides to be the other package detail.'
where name = 'Waterproofing upstands and terminations';

update interface_rules set
  trade_codes = array(select distinct unnest(trade_codes || '{WALL}'::text[])),
  guidance = 'The boundary between supplied fire protection and its application and inspection is rarely stated in either package. Confirm the system, the dry film thickness, and who certifies it.'
where name = 'Beam encasement and fire protection to structure';

update interface_rules set
  trade_codes = array(select distinct unnest(trade_codes || '{STEE,PBHL}'::text[])),
  guidance = 'Builders work schedules produced from a single service drawing rather than the coordinated combined set do not reconcile across disciplines. Holes through post-tensioned or transfer structure also need structural approval, which is a genuine structural risk as well as a scope gap.'
where name = 'Builders work openings, forming and making good';

update interface_rules set
  guidance = 'Most commonly excluded by every services package. Penetrations through rated partitions are commonly sealed with a generic method rather than the specific product tested for that partition rated assembly. Confirm the tested system, not just the performance.'
where name = 'Fire stopping to service penetrations';

update interface_rules set
  trade_codes = array(select distinct unnest(trade_codes || '{DATA,MECH}'::text[])),
  guidance = 'Services often price to within one metre; joinery and FF&E often exclude connection entirely. Joinery is manufactured off site and cannot absorb late service changes. Confirm services are coordinated and setting out is checked against as-built dimensions before manufacture starts.'
where name = 'Final connections to loose and joinery items';

update interface_rules set
  guidance = 'The electrical package prices containment for power only; security and data assume it is provided. Insufficient separation between power and data containment is discovered only once both are installed. Confirm the separation distance is achievable on the coordinated drawing, not just stated in the specification.'
where name = 'Containment for security and data';

update interface_rules set
  guidance = 'Cavity barriers at the facade zone are routinely excluded by both the cladding and the fire stopping packages. Confirm which package supplies, installs and certifies.'
where name = 'Cavity barrier / fire seal at facade junction';

/* ------------------------------------------------------------------ */
/* 2b. Bible interfaces with no existing equivalent                    */
/* ------------------------------------------------------------------ */

insert into interface_rules (name, trigger_terms, context_terms, trade_codes, severity, guidance)
select v.name, v.trigger_terms, v.context_terms, v.trade_codes, v.severity, v.guidance
from (values
  ('Foundation to ground-bearing slab handover',
   '{pile cap,ground beam,construction joint,waterbar,formation level,ground bearing slab}'::text[],
   '{foundation,substructure,slab,level}'::text[],
   '{GRND,CONC}'::text[],'high',
   'Foundation to ground-bearing slab handover. Construction joints, waterbars and levels are routinely not reconciled between the two packages.'),

  ('Base plate setting out against as-built concrete',
   '{base plate,holding down bolt,setting out,composite deck,metal deck}',
   '{column,steel,concrete,tolerance}',
   '{CONC,STEE}','high',
   'Base plate setting-out tolerance against as-built concrete positions, and composite deck design responsibility. Confirm who checks the as-built before fabrication is finalised.'),

  ('Service penetrations through the waterproof envelope',
   '{service entry,pipe entry,duct entry,puddle flange,lift pit,sump}',
   '{tanking,waterproofing,membrane,below ground,basement}',
   '{WPRF,MECH,ELEC,PBHL}','high',
   'Penetrations through the waterproof envelope are detailed generically and rarely checked against the actual pipe and duct sizes and positions. The lift pit and sump are the highest-risk penetrations on the whole below-ground envelope.'),

  ('Cavity closers and DPC continuity at openings',
   '{cavity closer,cavity tray,dpc,cill,sill,reveal,jamb,weep}',
   '{opening,window,door,lintel,abutment}',
   '{MASO,GLAZ,CWAL}','high',
   'Cavity closers, cill details and DPC continuity around openings are routinely left unresolved between the masonry and glazing packages. Check every condition, not just the typical detail.'),

  ('Fire and smoke dampers at compartment lines',
   '{fire damper,smoke damper,damper,compartment line,fan shutdown}',
   '{duct,ductwork,ventilation,compartment,riser}',
   '{MECH,FSTP}','high',
   'Dampers shown on the fire strategy but missing from the ductwork layout, or the reverse. The fan shutdown interface is frequently undefined until commissioning.'),

  ('Fire alarm cause and effect matrix',
   '{cause and effect,door release,lift recall,fan shutdown,interlock,alarm zoning}',
   '{fire alarm,detection,life safety,smoke control}',
   '{ELEC,FSTP,MECH,LIFT}','high',
   'The cause-and-effect matrix is often never produced as a document and is left to be resolved during commissioning. Confirm it exists and that every interface named in it is in someone''s scope.'),

  ('Ceiling void depth coordination',
   '{ceiling void,void depth,soffit zone,bulkhead,suspended ceiling}',
   '{duct,tray,pipe,sprinkler,luminaire,structure,downstand}',
   '{CEIL,DRYL,MECH,ELEC,SPRK}','high',
   'The void depth designed for by services rarely survives coordination with structure, lighting and sprinklers. Confirm the achievable depth before the ceiling grid is set out.'),

  ('Lift lobby threshold and floor finish transition',
   '{threshold,transition,lift entrance,landing sill}',
   '{lift,lobby,floor finish,level}',
   '{LIFT,FLOR,SCRD}','medium',
   'Floor finish build-up and lift lobby threshold levels are rarely detailed together, leaving a step or gap discovered once finishes are complete.'),

  ('Acoustic floor perimeter isolation',
   '{floating floor,resilient layer,isolation,perimeter strip,acoustic floor}',
   '{partition,wall,column,penetration,riser}',
   '{ACFL,DRYL,FLOR}','high',
   'A single unisolated point at the perimeter or a penetration compromises the tested performance of the whole system. Confirm continuity of isolation, not just the product specification.'),

  ('Substrate handover standard before decoration',
   '{substrate,preparation,flatness,skim,handover standard}',
   '{paint,decoration,finish,plaster,plasterboard,wallcovering}',
   '{PLAS,DRYL,WALL}','medium',
   'The handover standard between plastering or drylining and decorating is rarely agreed, so a visible flaw becomes a dispute over whose defect it is. Agree the tolerance and inspection standard in both scopes.'),

  ('Temporary works design responsibility',
   '{temporary works,propping,shoring,formwork,falsework,scaffold,edge protection}',
   '{excavation,erection,stability,sequence,removal}',
   '{TMPW,GRND,CONC,STEE}','high',
   'Temporary works design is often assumed included in a subcontractor price with no explicit statement to that effect. Confirm the design responsibility, the independent check category, and who removes it and makes good.'),

  ('Site levels reconciled at the building platform',
   '{formation level,cut and fill,platform level,site level,finished level,ffl}',
   '{external,drainage,foundation,boundary,threshold}',
   '{CIVL,GRND}','high',
   'Site-wide drainage and cut and fill levels are frequently not reconciled with foundation formation levels at the platform boundary.'),

  ('Feature and external lighting scope allocation',
   '{feature lighting,facade lighting,landscape lighting,external lighting,signage lighting}',
   '{elevation,external,facade,landscape,visualisation}',
   '{LTNG,ELEC,CLAD,EXTW}','medium',
   'Feature, facade and landscape lighting appears on visualisations and is never translated into an electrical layout, a schedule, or a scope allocation. Confirm which package carries supply, installation and power.'),

  ('Tanking behind and beneath wet area tiling',
   '{tanking,wet area,wet room,waterproof membrane,shower tray}',
   '{tile,tiling,shower,bathroom,kitchen,gully}',
   '{TILE,WPRF,PBHL}','high',
   'Tanking behind and beneath wet-area tiling is assumed included by each package when it was priced as the other. This is a leading wet-room defect dispute.'),

  ('Paving over podium or basement structure',
   '{paving,podium,protection layer,ballast,paving pedestal}',
   '{basement,waterproofing,membrane,loading,fire appliance,drainage}',
   '{PAVE,WPRF,CIVL,CONC}','high',
   'Paving over a podium or basement is specified without checking structural loading capacity and the drainage and protection of the membrane beneath it. Fire appliance access paving in particular is often specified as standard pedestrian build-up.')
) as v(name, trigger_terms, context_terms, trade_codes, severity, guidance)
where not exists (select 1 from interface_rules r where r.name = v.name);

/* ------------------------------------------------------------------ */
/* 3. Deferral language from the bible's vague-scope section           */
/*    Base severity only. The engine raises anything naming no         */
/*    responsible party, and anything touching life safety, to high.   */
/* ------------------------------------------------------------------ */

insert into deferral_patterns (category, pattern, default_severity, recommended_action, commercial_risk)
select v.category, v.pattern, v.default_severity, v.recommended_action, v.commercial_risk
from (values
  ('design_deferral','\bas required\b','medium',
   'Quantity or extent left open. Confirm what "as required" resolves to before the package is priced.',
   'Extent is unpriced, so the quantity installed becomes a variation.'),
  ('design_deferral','\bto suit\b','medium',
   'Dimension or specification left to be resolved on site. Confirm who determines it and against what.',
   'Resolved on site at whatever it costs on the day.'),
  ('design_deferral','\brefer to specialist design\b|\bspecialist design\b','high',
   'Design responsibility passed to a specialist. Confirm the specialist is appointed and has accepted the design responsibility in writing.',
   'If no specialist is appointed, the design responsibility sits nowhere.'),
  ('design_deferral','\bassumed position\b|\bposition assumed\b|\bapproximate position\b','high',
   'An existing condition assumed rather than verified. Confirm survey or trial hole data exists before this is carried into a fixed price.',
   'An unverified assumption carried into a fixed price is a variation waiting to happen.'),
  ('design_deferral','\bpending\b.{0,30}\b(gi|ground investigation|survey|report|approval)\b','high',
   'Design shown as pending information. Confirm the information has arrived and the design has been reissued.',
   'Work priced against pending information is priced against a design that will change.'),
  ('design_deferral','\bto be agreed\b|\bT\.?B\.?A\.?\b','medium',
   'Unresolved. Track to closure before the package is let.',
   'Unagreed scope at let is scope nobody has priced.'),
  ('scope_boundary','\bexclud(ed|es|ing)\b','high',
   'An explicit exclusion. Confirm another package picks it up — an exclusion nobody claims is a guaranteed variation.',
   'An exclusion nobody picks up is the most reliable variation in construction.'),
  ('scope_boundary','\bwarrant(y|ies)\b|\bguarantee\b|\bsingle point responsibility\b|\bsystem warranty\b','medium',
   'Warranty or guarantee responsibility named but not allocated. Confirm which party carries the system warranty for the installed work and that they have accepted design responsibility for it as installed.',
   'Warranty responsibility for a waterproofing, roofing, facade or tanking system is frequently unstated, so nobody has taken design responsibility for it as installed.'),
  ('performance_req','\bto engineer.{0,3}s design\b|\bto structural engineer.{0,3}s detail\b','high',
   'Design deferred to the engineer. Confirm the detail has been issued and is in a package scope.',
   'A detail deferred to the engineer and never issued is built to whatever arrives first on site.'),
  ('performance_req','\bmanufacturer.{0,3}s (details|recommendations|instructions)\b','medium',
   'Performance deferred to a manufacturer. Confirm the manufacturer is selected and their detail matches what is drawn.',
   'The manufacturer detail rarely matches the drawn detail, and the difference is priced by nobody.'),
  ('hold_status','\bsubject to (approval|sign.?off|confirmation)\b','high',
   'Approval outstanding. Nothing downstream can be relied upon until it is granted.',
   'Everything downstream of an outstanding approval is at risk of rework.')
) as v(category, pattern, default_severity, recommended_action, commercial_risk)
where not exists (select 1 from deferral_patterns d where d.pattern = v.pattern);

commit;
