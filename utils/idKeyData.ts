// Trait table for the ID key (utils/idKey.ts): one line per species in mycoVocab SPECIES.
// Written by hand from general mycology knowledge (field marks found in any field guide), not
// copied from a published key. Traits are what a forayer can see or test in the field.
//
// Line format:  Latin name | common name | groups | traits [| aka synonyms, comma separated]
//   groups:  comma list of GROUP option ids (see idKey.ts QUESTIONS[0])
//   traits:  space separated key:value1,value2 (ring:y / ring:n for yes-no questions)
//            plus bare flags: deadly, toxic
// A missing trait means "not recorded" and never counts against a species.

export const SPECIES_LINES = String.raw`
Amanita muscaria | fly agaric | gills | sp:white att:free ring:y volva:y col:red,orange,yellow sub:ground host:conifer,hardwood grow:single sz:m,l toxic
Amanita phalloides | death cap | gills | sp:white att:free ring:y volva:y col:green,yellow,white sub:ground host:hardwood,conifer grow:single sz:m stain:none deadly
Amanita bisporigera | destroying angel | gills | sp:white att:free ring:y volva:y col:white sub:ground host:hardwood,conifer grow:single sz:m stain:none deadly
Amanita virosa | European destroying angel | gills | sp:white att:free ring:y volva:y col:white sub:ground host:hardwood,conifer grow:single sz:m deadly
Amanita ocreata | western destroying angel | gills | sp:white att:free ring:y volva:y col:white sub:ground host:hardwood grow:single sz:m,l deadly
Amanita caesarea | Caesar's mushroom | gills | sp:white att:free ring:y volva:y col:orange,red sub:ground host:hardwood sz:m,l
Amanita jacksonii | American Caesar's mushroom | gills | sp:white att:free ring:y volva:y col:red,orange sub:ground host:hardwood,conifer sz:m
Amanita flavoconia | yellow patches | gills | sp:white att:free ring:y volva:y col:yellow,orange sub:ground host:hardwood,conifer sz:s,m
Amanita fulva | tawny grisette | gills | sp:white att:free ring:n volva:y col:orange,brown sub:ground host:hardwood,conifer sz:m
Amanita vaginata | grisette | gills | sp:white att:free ring:n volva:y col:gray,brown sub:ground host:hardwood,conifer sz:m
Amanita pantherina | panther cap | gills | sp:white att:free ring:y volva:y col:brown sub:ground host:conifer,hardwood sz:m toxic
Amanita rubescens | blusher | gills | sp:white att:free ring:y volva:n stain:red col:brown,pink sub:ground host:hardwood,conifer sz:m,l
Amanita citrina | false death cap | gills | sp:white att:free ring:y volva:y col:yellow,white sub:ground host:hardwood,conifer sz:m
Amanita frostiana | Frost's amanita | gills | sp:white att:free ring:y volva:y col:red,orange,yellow sub:ground host:conifer,hardwood sz:s,m
Agaricus campestris | meadow mushroom | gills | sp:purple,brown att:free ring:y volva:n col:white sub:grass grow:single sz:m
Agaricus arvensis | horse mushroom | gills | sp:purple,brown att:free ring:y volva:n col:white stain:yellow odor:anise sub:grass sz:m,l
Agaricus augustus | the prince | gills | sp:purple,brown att:free ring:y volva:n col:brown,yellow stain:yellow odor:anise sub:ground sz:l
Agaricus bisporus | button mushroom | gills | sp:purple,brown att:free ring:y volva:n col:white,brown sub:ground,grass,dung sz:m
Agaricus bitorquis | pavement mushroom | gills | sp:purple,brown att:free ring:y volva:n col:white sub:ground sz:m
Agaricus silvicola | wood mushroom | gills | sp:purple,brown att:free ring:y volva:n col:white stain:yellow odor:anise sub:ground host:conifer,hardwood sz:m
Agaricus xanthodermus | yellow stainer | gills | sp:purple,brown att:free ring:y volva:n col:white stain:yellow odor:chemical sub:grass,ground sz:m toxic
Armillaria mellea | honey mushroom | gills | sp:white att:attached,decurrent ring:y volva:n col:yellow,brown sub:wood host:hardwood grow:cluster sz:s,m
Armillaria ostoyae | dark honey fungus | gills | sp:white att:attached,decurrent ring:y volva:n col:brown sub:wood host:conifer grow:cluster sz:s,m
Armillaria gallica | bulbous honey fungus | gills | sp:white att:attached,decurrent ring:y volva:n col:brown,yellow sub:wood,ground host:hardwood grow:cluster sz:s,m
Chlorophyllum molybdites | green-spored parasol | gills | sp:green att:free ring:y volva:n col:white,brown sub:grass grow:single,cluster sz:l toxic
Chlorophyllum rhacodes | shaggy parasol | gills | sp:white att:free ring:y volva:n col:brown,white stain:red sub:ground sz:l
Macrolepiota procera | parasol | gills | sp:white att:free ring:y volva:n col:brown,white sub:grass,ground sz:l
Lepiota cristata | stinking dapperling | gills | sp:white att:free ring:y volva:n col:white,brown odor:chemical sub:ground sz:s toxic
Leucoagaricus leucothites | white dapperling | gills | sp:white att:free ring:y volva:n col:white sub:grass sz:m
Coprinus comatus | shaggy mane | gills | sp:black att:free ring:y volva:n col:white sub:grass,ground grow:single,cluster sz:m,l
Coprinopsis atramentaria | common ink cap | gills | sp:black att:free ring:n col:gray sub:wood,ground grow:cluster sz:m
Coprinellus micaceus | mica cap | gills | sp:black att:attached ring:n col:brown,yellow sub:wood host:hardwood grow:cluster sz:s
Psathyrella candolleana | pale brittlestem | gills | sp:purple,brown att:attached col:white,brown sub:wood,ground host:hardwood grow:cluster sz:s,m
Panaeolus foenisecii | lawn mower's mushroom | gills | sp:brown att:attached ring:n col:brown sub:grass grow:single sz:s
Psilocybe cyanescens | wavy cap | gills | sp:purple att:attached ring:n stain:blue col:brown sub:wood grow:cluster sz:s,m
Psilocybe cubensis | golden teacher | gills | sp:purple att:attached ring:y stain:blue col:brown,yellow sub:dung sz:m
Stropharia rugosoannulata | wine cap | gills | sp:purple att:attached ring:y volva:n col:red,brown sub:wood,ground sz:m,l
Stropharia aeruginosa | verdigris agaric | gills | sp:purple att:attached ring:y slimy:y col:green,blue sub:ground,wood sz:s,m
Hypholoma fasciculare | sulphur tuft | gills | sp:purple att:attached ring:n col:yellow,orange sub:wood host:hardwood,conifer grow:cluster sz:s,m toxic
Hypholoma capnoides | conifer tuft | gills | sp:purple att:attached ring:n col:yellow,orange sub:wood host:conifer grow:cluster sz:s,m
Pholiota squarrosa | shaggy scalycap | gills | sp:brown,rust att:attached ring:y col:yellow,brown sub:wood host:hardwood,conifer grow:cluster sz:m
Kuehneromyces mutabilis | sheathed woodtuft | gills | sp:brown,rust att:attached ring:y col:brown,orange sub:wood host:hardwood grow:cluster sz:s,m
Galerina marginata | funeral bell | gills | sp:rust,brown att:attached ring:y col:brown,orange odor:farina sub:wood host:conifer,hardwood grow:cluster,single sz:s deadly
Gymnopilus junonius | laughing gym | gills | sp:rust att:attached ring:y col:orange,yellow sub:wood host:hardwood,conifer grow:cluster sz:m,l
Cortinarius violaceus | violet webcap | gills | sp:rust att:attached col:purple sub:ground host:conifer,hardwood sz:m
Cortinarius caperatus | gypsy mushroom | gills | sp:rust,brown att:attached ring:y col:yellow,brown sub:ground host:conifer sz:m
Inocybe geophylla | white fibercap | gills | sp:brown att:attached col:white,purple sub:ground host:conifer,hardwood sz:s toxic
Paxillus involutus | brown roll-rim | gills | sp:brown att:decurrent stain:brown col:brown sub:ground host:hardwood,conifer sz:m toxic
Tapinella atrotomentosa | velvet roll-rim | gills | sp:brown att:decurrent col:brown sub:wood host:conifer sz:m,l
Chroogomphus rutilus | copper spike | gills | sp:black att:decurrent col:orange,brown,red sub:ground host:conifer sz:m
Gymnopus dryophilus | oak-loving collybia | gills | sp:white,cream att:attached ring:n col:brown,orange sub:ground host:hardwood,conifer grow:cluster,single sz:s
Marasmius oreades | fairy ring mushroom | gills | sp:white att:attached,free ring:n col:brown,white sub:grass grow:single sz:s
Marasmius rotula | pinwheel mushroom | gills | sp:white att:free ring:n col:white sub:wood grow:cluster sz:s
Megacollybia rodmanii | platterful mushroom | gills | sp:white att:attached ring:n col:brown,gray sub:wood host:hardwood sz:m,l
Mycena haematopus | bleeding mycena | gills | sp:white att:attached milk:y col:red,brown,pink sub:wood host:hardwood grow:cluster sz:s
Mycena galericulata | common bonnet | gills | sp:white att:attached ring:n col:gray,brown sub:wood host:hardwood grow:cluster sz:s
Mycena leaiana | orange mycena | gills | sp:white att:attached slimy:y col:orange sub:wood host:hardwood grow:cluster sz:s
Flammulina velutipes | velvet foot | gills | sp:white att:attached ring:n slimy:y col:orange,brown sub:wood host:hardwood grow:cluster sz:s,m
Clitocybe nuda | blewit | gills | sp:pink att:attached ring:n col:purple,brown odor:fruity sub:ground sz:m | Lepista nuda
Clitocybe dealbata | ivory funnel | gills | sp:white att:decurrent ring:n col:white sub:grass sz:s toxic
Clitocybe odora | aniseed funnel | gills | sp:white,pink att:decurrent,attached ring:n col:green,blue odor:anise sub:ground sz:m
Laccaria amethystina | amethyst deceiver | gills | sp:white att:attached ring:n col:purple sub:ground sz:s
Laccaria laccata | deceiver | gills | sp:white att:attached ring:n col:orange,pink,brown sub:ground sz:s
Laccaria bicolor | bicolored deceiver | gills | sp:white att:attached ring:n col:brown,pink sub:ground host:conifer,hardwood sz:s
Hygrocybe conica | witch's hat | gills | sp:white att:free,attached ring:n slimy:y stain:black col:red,orange,yellow sub:grass,ground sz:s
Hygrocybe coccinea | scarlet waxcap | gills | sp:white att:attached ring:n slimy:y col:red sub:grass sz:s
Hygrocybe miniata | vermilion waxcap | gills | sp:white att:attached ring:n col:red,orange sub:ground,grass sz:s
Hygrophorus russula | pinkmottle woodwax | gills | sp:white att:attached,decurrent ring:n col:pink,red,purple sub:ground host:hardwood sz:m,l
Hygrophoropsis aurantiaca | false chanterelle | gills | sp:white,cream att:decurrent ring:n col:orange sub:ground,wood host:conifer sz:s,m
Omphalotus illudens | jack-o'-lantern | gills | sp:cream,white att:decurrent ring:n col:orange sub:wood host:hardwood grow:cluster sz:m toxic
Omphalotus olearius | European jack-o'-lantern | gills | sp:cream,white att:decurrent ring:n col:orange sub:wood host:hardwood grow:cluster sz:m toxic
Entoloma abortivum | aborted entoloma | gills | sp:pink att:decurrent,attached ring:n col:gray,white sub:wood,ground host:hardwood sz:m
Pluteus cervinus | deer mushroom | gills | sp:pink att:free ring:n volva:n col:brown sub:wood host:hardwood,conifer sz:m
Tricholoma magnivelare | American matsutake | gills | sp:white att:attached ring:y col:white stain:brown odor:sweet sub:ground host:conifer sz:m,l
Tricholoma murrillianum | western matsutake | gills | sp:white att:attached ring:y col:white,brown stain:brown odor:sweet sub:ground host:conifer sz:m,l
Tricholoma equestre | man on horseback | gills | sp:white att:attached ring:n col:yellow odor:farina sub:ground host:conifer sz:m toxic | Tricholoma flavovirens
Tricholomopsis rutilans | plums and custard | gills | sp:white att:attached ring:n col:red,purple,yellow sub:wood host:conifer sz:m
Russula emetica | the sickener | gills | sp:white att:attached ring:n milk:n col:red sub:ground host:conifer sz:m toxic
Russula brevipes | short-stemmed russula | gills | sp:white,cream att:attached,decurrent ring:n milk:n col:white sub:ground host:conifer sz:l
Russula cyanoxantha | charcoal burner | gills | sp:white att:attached ring:n milk:n col:purple,green,blue sub:ground host:hardwood sz:m
Russula virescens | green-cracking russula | gills | sp:white,cream att:attached ring:n milk:n col:green sub:ground host:hardwood sz:m
Russula xerampelina | shrimp russula | gills | sp:cream att:attached ring:n milk:n stain:brown col:red,purple,brown odor:fishy sub:ground host:conifer sz:m
Lactarius deliciosus | saffron milk cap | gills | sp:cream,white att:attached,decurrent ring:n milk:y stain:green col:orange sub:ground host:conifer sz:m
Lactarius indigo | indigo milk cap | gills | sp:cream att:attached ring:n milk:y stain:green col:blue sub:ground host:conifer,hardwood sz:m
Lactarius torminosus | woolly milkcap | gills | sp:cream att:attached,decurrent ring:n milk:y col:pink,orange sub:ground host:hardwood sz:m
Lactarius rufus | rufous milkcap | gills | sp:white,cream att:attached ring:n milk:y col:red,brown sub:ground host:conifer sz:m
Lactarius volemus | voluminous-latex milky | gills | sp:white att:attached ring:n milk:y stain:brown col:orange,brown odor:fishy sub:ground host:hardwood sz:m | Lactifluus volemus
Lactarius rubidus | candy cap | gills | sp:white,cream att:attached ring:n milk:y col:orange,brown odor:sweet sub:ground,wood host:conifer,hardwood sz:s
Pleurotus ostreatus | oyster mushroom | gills | sp:white,purple att:decurrent ring:n col:white,gray,brown sub:wood host:hardwood grow:cluster sz:m,l
Pleurotus pulmonarius | phoenix oyster | gills | sp:white att:decurrent ring:n col:white,brown sub:wood host:hardwood,conifer grow:cluster sz:m
Pleurotus populinus | aspen oyster | gills | sp:white,cream att:decurrent ring:n col:white sub:wood host:hardwood grow:cluster sz:m
Panellus stipticus | bitter oyster | gills | sp:white att:attached ring:n col:brown,orange,yellow sub:wood host:hardwood grow:cluster sz:s
Schizophyllum commune | split gill | gills,shelf | sp:white col:white,gray sub:wood host:hardwood grow:cluster sz:s
Lentinula edodes | shiitake | gills | sp:white att:attached ring:n col:brown sub:wood host:hardwood sz:m

Boletus edulis | king bolete | bolete | sp:olive scabers:n stain:none col:brown,red sub:ground host:conifer,hardwood sz:m,l
Boletus barrowsii | white king bolete | bolete | sp:olive scabers:n stain:none col:white sub:ground host:conifer,hardwood sz:l
Boletus rex-veris | spring king bolete | bolete | sp:olive scabers:n stain:none col:brown,red sub:ground host:conifer sz:l
Boletus subcaerulescens | bluing king bolete | bolete | sp:olive scabers:n stain:blue col:brown,red sub:ground host:conifer sz:l
Butyriboletus frostii | Frost's bolete | bolete | sp:olive scabers:n stain:blue slimy:y col:red sub:ground host:hardwood sz:m
Xerocomellus chrysenteron | red-cracking bolete | bolete | sp:olive scabers:n stain:blue col:brown sub:ground host:hardwood,conifer sz:m
Leccinum scabrum | birch bolete | bolete | sp:brown,olive scabers:y stain:none col:brown sub:ground host:hardwood sz:m
Leccinum aurantiacum | red-capped scaber stalk | bolete | sp:brown,olive scabers:y stain:black col:orange,red sub:ground host:hardwood sz:m,l
Leccinum versipelle | orange birch bolete | bolete | sp:brown,olive scabers:y stain:black col:orange sub:ground host:hardwood sz:m,l
Leccinum insigne | aspen scaber stalk | bolete | sp:brown,olive scabers:y stain:black col:orange sub:ground host:hardwood sz:m
Suillus luteus | slippery jack | bolete | sp:brown scabers:n ring:y slimy:y col:brown sub:ground host:conifer sz:m
Suillus americanus | chicken fat mushroom | bolete | sp:brown scabers:n slimy:y col:yellow sub:ground host:conifer sz:s,m
Suillus brevipes | short-stalked slippery jack | bolete | sp:brown scabers:n ring:n slimy:y col:brown sub:ground host:conifer sz:m
Suillus granulatus | weeping bolete | bolete | sp:brown scabers:n ring:n slimy:y col:brown,orange,yellow sub:ground host:conifer sz:m
Suillus grevillei | larch bolete | bolete | sp:brown scabers:n ring:y slimy:y col:orange,yellow sub:ground host:conifer sz:m
Suillus lakei | western painted suillus | bolete | sp:brown scabers:n ring:y slimy:n col:red,brown sub:ground host:conifer sz:m
Suillus pictus | painted suillus | bolete | sp:brown scabers:n ring:y slimy:n col:red sub:ground host:conifer sz:m | Suillus spraguei
Suillus tomentosus | woolly-capped suillus | bolete | sp:brown scabers:n stain:blue slimy:y col:yellow,orange sub:ground host:conifer sz:m
Tylopilus felleus | bitter bolete | bolete | sp:pink scabers:n col:brown sub:ground host:hardwood,conifer sz:m,l
Strobilomyces strobilaceus | old man of the woods | bolete | sp:black scabers:n stain:red,black col:black,gray,white sub:ground host:hardwood sz:m
Gyroporus castaneus | chestnut bolete | bolete | sp:cream scabers:n stain:none col:brown,orange sub:ground host:hardwood sz:s,m

Laetiporus sulphureus | chicken of the woods | shelf | sp:white col:orange,yellow sub:wood host:hardwood grow:cluster sz:l
Laetiporus cincinnatus | white-pored chicken of the woods | shelf | sp:white col:orange sub:wood,ground host:hardwood grow:cluster sz:l
Laetiporus conifericola | conifer chicken of the woods | shelf | sp:white col:orange,yellow sub:wood host:conifer grow:cluster sz:l
Grifola frondosa | hen of the woods | shelf | sp:white col:brown,gray sub:wood,ground host:hardwood grow:cluster sz:l
Meripilus sumstinei | black-staining polypore | shelf | sp:white stain:black col:brown,yellow sub:wood,ground host:hardwood grow:cluster sz:l
Trametes versicolor | turkey tail | shelf | col:brown,gray,white sub:wood host:hardwood grow:cluster sz:s
Trametes hirsuta | hairy bracket | shelf | col:white,gray sub:wood host:hardwood grow:cluster sz:s
Trametes gibbosa | lumpy bracket | shelf | col:white,gray sub:wood host:hardwood sz:m
Ganoderma applanatum | artist's conk | shelf | sp:brown stain:brown col:brown sub:wood host:hardwood sz:l
Ganoderma lucidum | reishi | shelf | sp:brown col:red,brown sub:wood host:hardwood sz:m
Ganoderma tsugae | hemlock varnish shelf | shelf | sp:brown col:red,brown sub:wood host:conifer sz:m
Fomes fomentarius | tinder conk | shelf | col:gray,brown sub:wood host:hardwood sz:l
Fomitopsis pinicola | red-belted conk | shelf | col:red,brown,orange sub:wood host:conifer,hardwood sz:l
Fomitopsis betulina | birch polypore | shelf | col:white,brown sub:wood host:hardwood sz:m | Piptoporus betulinus
Cerioporus squamosus | dryad's saddle | shelf | sp:white col:brown,yellow sub:wood host:hardwood sz:l | Polyporus squamosus
Phaeolus schweinitzii | dyer's polypore | shelf | col:brown,yellow,orange sub:wood,ground host:conifer sz:l
Fistulina hepatica | beefsteak fungus | shelf | milk:y col:red sub:wood host:hardwood sz:m
Bjerkandera adusta | smoky polypore | shelf | col:gray,white sub:wood host:hardwood grow:cluster sz:s
Daedaleopsis confragosa | thin-walled maze polypore | shelf | stain:red col:brown sub:wood host:hardwood sz:s,m
Stereum hirsutum | hairy curtain crust | shelf | col:orange,yellow sub:wood host:hardwood grow:cluster sz:s
Stereum ostrea | false turkey tail | shelf | col:orange,brown sub:wood host:hardwood grow:cluster sz:s

Hydnum repandum | hedgehog mushroom | teeth | sp:white col:orange,yellow,white sub:ground host:conifer,hardwood sz:m
Hydnum umbilicatum | belly button hedgehog | teeth | sp:white col:orange sub:ground host:conifer sz:s
Hydnellum peckii | bleeding tooth | teeth | milk:y col:white,pink,brown sub:ground host:conifer sz:m
Hericium erinaceus | lion's mane | teeth | sp:white col:white sub:wood host:hardwood sz:l
Hericium coralloides | comb tooth | teeth,coral | sp:white col:white sub:wood host:hardwood sz:m,l
Hericium americanum | bear's head tooth | teeth,coral | sp:white col:white sub:wood host:hardwood sz:l

Cantharellus cibarius | golden chanterelle | ridges | sp:white,cream col:yellow,orange odor:fruity sub:ground host:hardwood,conifer sz:m
Cantharellus formosus | Pacific golden chanterelle | ridges | sp:white,cream col:yellow,orange odor:fruity sub:ground host:conifer sz:m
Cantharellus cinnabarinus | cinnabar chanterelle | ridges | sp:white,pink col:red,pink sub:ground host:hardwood sz:s
Cantharellus lateritius | smooth chanterelle | ridges | sp:pink,cream col:orange,yellow odor:fruity sub:ground host:hardwood sz:m
Craterellus cornucopioides | black trumpet | ridges | sp:white,cream col:black,gray sub:ground host:hardwood sz:s,m
Craterellus tubaeformis | yellow foot | ridges | sp:white,cream col:brown,yellow sub:ground,wood host:conifer sz:s
Gomphus clavatus | pig's ear | ridges | sp:brown col:purple,brown sub:ground host:conifer sz:m
Turbinellus floccosus | scaly vase chanterelle | ridges | sp:brown col:orange,red sub:ground host:conifer sz:m
Hypomyces lactifluorum | lobster mushroom | ridges,other | col:orange,red sub:mushroom,ground sz:m

Lycoperdon perlatum | common puffball | ball | col:white,brown sub:ground grow:single,cluster sz:s
Lycoperdon pyriforme | pear-shaped puffball | ball | col:brown,white sub:wood grow:cluster sz:s
Calvatia gigantea | giant puffball | ball | col:white sub:grass,ground sz:l
Calvatia cyathiformis | purple-spored puffball | ball | col:white,brown sub:grass sz:l
Bovista plumbea | paper puffball | ball | col:white,gray sub:grass sz:s
Scleroderma citrinum | common earthball | ball | col:yellow,brown sub:ground host:hardwood,conifer sz:s toxic
Geastrum saccatum | rounded earthstar | ball | col:brown sub:ground sz:s
Rhizopogon roseolus | blushing false truffle | ball | stain:red col:white,pink sub:ground host:conifer sz:s

Ramaria botrytis | pink-tipped coral | coral | col:white,pink,purple sub:ground sz:m,l
Ramaria formosa | salmon coral | coral | col:pink,orange sub:ground host:hardwood sz:m toxic
Clavaria fragilis | white spindles | coral | col:white sub:ground,grass grow:cluster sz:s
Clavulina cristata | crested coral | coral | col:white sub:ground sz:s
Calocera viscosa | yellow stagshorn | coral,jelly | col:yellow,orange sub:wood host:conifer sz:s
Xylaria polymorpha | dead man's fingers | coral | col:black sub:wood host:hardwood grow:cluster sz:s
Xylaria hypoxylon | candlesnuff fungus | coral | col:black,white sub:wood grow:cluster sz:s
Sparassis crispa | cauliflower mushroom | coral | col:white,yellow sub:wood,ground host:conifer sz:l
Sparassis spathulata | eastern cauliflower mushroom | coral | col:white,yellow sub:wood,ground host:hardwood sz:l

Tremella mesenterica | witches' butter | jelly | col:yellow,orange sub:wood host:hardwood sz:s
Auricularia auricula-judae | jelly ear | jelly | col:brown sub:wood host:hardwood sz:s
Auricularia americana | wood ear | jelly | col:brown sub:wood host:conifer sz:s

Aleuria aurantia | orange peel fungus | cup | col:orange sub:ground sz:s
Sarcoscypha coccinea | scarlet elf cup | cup | col:red sub:wood host:hardwood sz:s
Sarcoscypha austriaca | scarlet elf cup | cup | col:red sub:wood host:hardwood sz:s
Chlorociboria aeruginascens | green elf cup | cup | col:green,blue sub:wood host:hardwood sz:s
Crucibulum laeve | common bird's nest | cup | col:yellow,brown sub:wood grow:cluster sz:s
Cyathus striatus | fluted bird's nest | cup | col:brown,gray sub:wood grow:cluster sz:s

Morchella esculenta | yellow morel | morel | col:yellow,brown sub:ground host:hardwood sz:m
Morchella americana | American yellow morel | morel | col:yellow,brown sub:ground host:hardwood sz:m
Morchella elata | black morel | morel | col:black,brown sub:ground host:conifer sz:m
Morchella importuna | landscape morel | morel | col:black,brown sub:ground,wood sz:m
Gyromitra esculenta | false morel | morel | col:red,brown sub:ground host:conifer sz:m deadly
Gyromitra infula | hooded false morel | morel | col:brown,red sub:wood host:conifer sz:m toxic
Helvella crispa | white saddle | morel | col:white sub:ground sz:s
Helvella lacunosa | elfin saddle | morel | col:black,gray sub:ground host:conifer sz:s
Verpa bohemica | early false morel | morel | col:yellow,brown sub:ground host:hardwood sz:m toxic

Phallus impudicus | common stinkhorn | stinkhorn | col:white,brown odor:foul sub:ground,wood sz:m
Phallus ravenelii | Ravenel's stinkhorn | stinkhorn | col:white odor:foul sub:wood,ground grow:cluster sz:m
Clathrus ruber | red cage | stinkhorn | col:red odor:foul sub:ground,wood sz:m

Hypomyces chrysospermus | bolete mold | other | col:yellow,white sub:mushroom sz:m
`
