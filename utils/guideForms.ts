// What a fungus is shaped like decides which pictures the guided capture asks for. Pure data, so
// tests/guideforms.test.mjs and utils/score.ts can use it under node --experimental-strip-types.
//
// Every form lists its shots in the order the guide asks for them. A shot is one of four keys
// (the photo's `angle`, synced as text, see supabase/migrations/20261015000002_photo_angle.sql),
// so a form only changes the wording and which keys it uses, never the stored schema. The key
// names are a little loose for some forms: 'cap' is the top-facing view, 'underside' the
// spore-bearing surface, 'stem' the stipe or stalk with its base.

export const SHOT_ANGLES = ['cap', 'underside', 'stem', 'habitat'] as const
export type ShotAngle = (typeof SHOT_ANGLES)[number]

export interface FormShot {
  angle: ShotAngle
  /** Short name shown on the chip, e.g. "Gills". */
  label: string
  /** What to show in the picture, shown while the shot is selected. */
  hint: string
  /** MDI icon for the chip. */
  icon: string
}

export interface MushroomForm {
  id: string
  label: string
  /** Short name for the chip on the capture screen. */
  short: string
  /** Typical genera, so the picker reads as a list of examples. */
  examples: string
  icon: string
  /** One tip for this form, shown in the picker and under the shot hint. */
  tip: string
  shots: FormShot[]
}

const CAP: Omit<FormShot, 'label' | 'hint'> = { angle: 'cap', icon: 'mdi-umbrella-outline' }
const UNDERSIDE: Omit<FormShot, 'label' | 'hint'> = { angle: 'underside', icon: 'mdi-view-week-outline' }
const STEM: Omit<FormShot, 'label' | 'hint'> = { angle: 'stem', icon: 'mdi-format-vertical-align-center' }
const HABITAT: Omit<FormShot, 'label' | 'hint'> = { angle: 'habitat', icon: 'mdi-tree' }

const shot = (base: Omit<FormShot, 'label' | 'hint'>, label: string, hint: string): FormShot => ({ ...base, label, hint })

/** The four generic shots, used when the form isn't known yet. */
export const GENERIC_SHOTS: FormShot[] = [
  shot(CAP, 'Cap top', 'Look down on the cap'),
  shot(UNDERSIDE, 'Gills or pores', 'Tilt it to show the underside'),
  shot(STEM, 'Stem and base', 'Dig out the base, show the whole stem'),
  shot(HABITAT, 'Habitat', 'Step back to show where it grows'),
]

export const MUSHROOM_FORMS: MushroomForm[] = [
  {
    id: 'gilled',
    short: 'Gilled',
    label: 'Gilled mushroom',
    examples: 'Amanita, Russula, Agaricus, Coprinus',
    icon: 'mdi-mushroom-outline',
    tip: 'Dig up the whole stipe. Amanita-type fungi have a volva or bulb at the base, so get it in the same picture as the stem.',
    shots: [
      shot(CAP, 'Cap top', 'Look straight down on the cap'),
      shot(UNDERSIDE, 'Gills', 'Tilt the cap to show the gills, and whether they are free, attached or running down'),
      shot(STEM, 'Stipe and base', 'Dig up the base: the whole stipe with any volva or bulb in one picture'),
      shot(HABITAT, 'Habitat', 'Step back: what it grows on and which trees are near'),
    ],
  },
  {
    id: 'pored',
    short: 'Pored',
    label: 'Pored (bolete)',
    examples: 'Boletus, Suillus, Leccinum',
    icon: 'mdi-grid',
    tip: 'Check the pores, not gills. Cut one and note whether it bruises blue. Dig up the stalk base.',
    shots: [
      shot(CAP, 'Cap top', 'Look straight down on the cap'),
      shot(UNDERSIDE, 'Pores', 'Tilt it to show the pore surface, and its colour'),
      shot(STEM, 'Stipe and base', 'Dig up the base with the whole stipe in one picture'),
      shot(HABITAT, 'Habitat', 'Step back to show the trees it grows under'),
    ],
  },
  {
    id: 'polypore',
    short: 'Bracket',
    label: 'Bracket or shelf',
    examples: 'Ganoderma, Trametes, Fomes',
    icon: 'mdi-layers-outline',
    tip: 'Shelves usually have no stipe, so there is no stem shot. Photograph the top and the pore or gill surface, then the wood it grows from.',
    shots: [
      shot(CAP, 'Top', 'Show the top of the shelf and its edge'),
      shot(UNDERSIDE, 'Pores or gills', 'Show the underside with its pores or gills'),
      shot(HABITAT, 'Wood', 'Show the log or stump it is on, and where on it'),
    ],
  },
  {
    id: 'crust',
    short: 'Crust',
    label: 'Crust or resupinate',
    examples: 'Corticioids and other crust fungi on logs',
    icon: 'mdi-texture',
    tip: 'No cap or stalk: shoot the fertile surface straight on, then the wood. Note whether the surface is smooth, toothed or wrinkled.',
    shots: [
      shot(UNDERSIDE, 'Surface', 'Shoot the spore-bearing surface straight on and close'),
      shot(HABITAT, 'Wood', 'Step back: the log or stump it covers and where on it'),
    ],
  },
  {
    id: 'cup',
    short: 'Cup',
    label: 'Cup or disc',
    examples: 'Peziza, Sarcoscypha, Cup fungi',
    icon: 'mdi-cup-outline',
    tip: 'The spores are inside the cup, so photograph the inside. Also the outside, and dig up the base if there is a stalk.',
    shots: [
      shot(CAP, 'Inside', 'Look into the cup: the spore surface is on the inside'),
      shot(UNDERSIDE, 'Outside and base', 'The outside, and where it joins the ground or wood'),
      shot(HABITAT, 'Habitat', 'Step back to show where it grows'),
    ],
  },
  {
    id: 'jelly',
    short: 'Jelly',
    label: 'Jelly',
    examples: 'Tremella, Exidia, Auricularia',
    icon: 'mdi-water-outline',
    tip: 'Jelly fungi shrink when they dry out, so photograph them as found, wet. Get one close shot of the texture and one from a step back.',
    shots: [
      shot(CAP, 'Whole body', 'The whole fruit body, close enough to show its texture'),
      shot(HABITAT, 'Habitat', 'Step back: the wood or twig it grows on'),
    ],
  },
  {
    id: 'coral',
    short: 'Coral',
    label: 'Coral or club',
    examples: 'Clavulina, Ramaria, Clavaria',
    icon: 'mdi-sprout-outline',
    tip: 'Dig up the base where the branches join, since many are fused at the stem.',
    shots: [
      shot(CAP, 'Branches', 'Show the branching tips and their colour'),
      shot(STEM, 'Base', 'Dig up the base where it joins the ground or wood'),
      shot(HABITAT, 'Habitat', 'Step back to show where it grows'),
    ],
  },
  {
    id: 'puffball',
    short: 'Puffball',
    label: 'Puffball or earthstar',
    examples: 'Lycoperdon, Calvatia, Geastrum',
    icon: 'mdi-circle-outline',
    tip: 'Cut it in half: the inside (solid, powdery or hollow) and its colour tell most species apart. For earthstars, shoot the whole star from above.',
    shots: [
      shot(CAP, 'Whole body', 'The whole fruit body, and any base or rooting structure'),
      shot(UNDERSIDE, 'Cut open', 'Slice it in half and show the inside'),
      shot(HABITAT, 'Habitat', 'Step back to show where it grows'),
    ],
  },
  {
    id: 'stinkhorn',
    short: 'Stinkhorn',
    label: 'Stinkhorn',
    examples: 'Phallus, Mutinus',
    icon: 'mdi-flower-outline',
    tip: 'Dig up the egg-like volva at the base. Write the smell down rather than sniffing it up close.',
    shots: [
      shot(CAP, 'Head', 'The head, with its spore slime'),
      shot(STEM, 'Stalk and volva', 'The stalk and the egg-like volva at its base, in one picture'),
      shot(HABITAT, 'Habitat', 'Step back to show what it grows from'),
    ],
  },
  {
    id: 'other',
    short: 'Other',
    label: 'Not sure or other',
    examples: 'Anything else. Pick a form once you know what it is.',
    icon: 'mdi-help-circle-outline',
    tip: 'The full set of shots. Choose a form when you know what the fungus is, and the guide will ask only for the pictures that matter.',
    shots: GENERIC_SHOTS,
  },
]

export const FORM_IDS = MUSHROOM_FORMS.map((f) => f.id)

export function formById(id: string | undefined): MushroomForm | undefined {
  return MUSHROOM_FORMS.find((f) => f.id === id)
}

/** The shots a find's form asks for. Without a known form, the generic four. */
export function shotsFor(formId: string | undefined): FormShot[] {
  return formById(formId)?.shots ?? GENERIC_SHOTS
}

/** The shot keys a find's form asks for, in order. */
export function anglesFor(formId: string | undefined): ShotAngle[] {
  return shotsFor(formId).map((s) => s.angle)
}

/** The shot for one angle in a form, if the form asks for that angle. */
export function shotFor(formId: string | undefined, angle: ShotAngle): FormShot | undefined {
  return shotsFor(formId).find((s) => s.angle === angle)
}
