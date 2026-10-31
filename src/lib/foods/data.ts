// Common foods and drinks eaten in Vietnam, with nutrition per 100 g (drinks: per 100 ml ≈ 100 g).
//
// Sources and assumptions:
// - Raw ingredients, eggs, tofu, giò lụa, nem chua, fruit: Bảng thành phần thực phẩm Việt Nam
//   (Viện Dinh dưỡng, 2007) and USDA FoodData Central.
// - Cooked dishes (phở, bún, cơm tấm, bánh mì…): typical street/home recipes, whole portion
//   including broth, noodles, meat and the usual fat; a "1 tô"/"1 đĩa" is a normal Vietnamese serving.
//   Restaurant versions vary by ±25%, so these are reasonable defaults the user can adjust.
// - Carbs are available carbohydrate (fibre not counted), so kcal = 4·đạm + 4·tinh bột + 9·béo
//   (+ 7·alcohol for beer, wine and spirits). kcal is always derived, never stored separately.
// - The first portion of each food is the default one added by search; "100 g" is added automatically.

export type FoodCategory =
  | "noodle"
  | "rice"
  | "bread"
  | "dish"
  | "soup"
  | "protein"
  | "veg"
  | "fruit"
  | "dairy"
  | "drink"
  | "sweet"
  | "snack"
  | "western"
  | "pantry";

export const FOOD_CATEGORY_LABEL: Record<FoodCategory, string> = {
  noodle: "Phở, bún, mì",
  rice: "Cơm, xôi, cháo",
  bread: "Bánh mì, bánh",
  dish: "Món mặn",
  soup: "Canh, lẩu",
  protein: "Thịt, cá, trứng",
  veg: "Rau, củ",
  fruit: "Trái cây",
  dairy: "Sữa",
  drink: "Đồ uống",
  sweet: "Chè, bánh ngọt",
  snack: "Ăn vặt",
  western: "Món Âu, fast food",
  pantry: "Gia vị, nguyên liệu",
};

export interface FoodPortion {
  label: string;
  g: number;
}

export interface Food {
  id: string;
  name: string;
  aliases: string[];
  category: FoodCategory;
  portions: FoodPortion[];
  /** Per 100 g. */
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

type P = [label: string, grams: number];

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function f(
  name: string,
  category: FoodCategory,
  [proteinG, carbG, fatG]: [number, number, number],
  portions: P[],
  aliases: string[] = [],
  alcoholG = 0,
): Food {
  const ps = portions.map(([label, g]) => ({ label, g }));
  if (!ps.some((p) => p.g === 100 && p.label === "100 g")) ps.push({ label: "100 g", g: 100 });
  return {
    id: slug(name),
    name,
    aliases,
    category,
    portions: ps,
    kcal: Math.round(4 * proteinG + 4 * carbG + 9 * fatG + 7 * alcoholG),
    proteinG,
    carbG,
    fatG,
  };
}

// Order matters only as a tie-breaker in search: more common foods first within each group.
export const FOODS: Food[] = [
  // ── Phở, bún, mì, hủ tiếu (whole bowl incl. broth) ──
  f("Phở bò", "noodle", [5.5, 10, 2.2], [["1 tô", 550], ["1 tô nhỏ", 400], ["1 tô đặc biệt", 700]], ["pho tai", "pho chin", "pho bo tai", "pho bo vien", "pho"]),
  f("Phở gà", "noodle", [5.5, 10, 1.8], [["1 tô", 550], ["1 tô nhỏ", 400]], ["pho ga"]),
  f("Phở xào", "noodle", [6, 20, 6], [["1 đĩa", 350]], ["pho xao bo"]),
  f("Phở cuốn", "noodle", [8, 22, 4], [["1 cuốn", 50], ["1 đĩa (6 cuốn)", 300]]),
  f("Bún bò Huế", "noodle", [5.5, 10, 3.3], [["1 tô", 600], ["1 tô nhỏ", 450]], ["bun bo", "bun bo hue"]),
  f("Bún chả", "noodle", [7, 15, 5], [["1 suất", 450], ["1 suất nhỏ", 350]], ["bun cha ha noi"]),
  f("Bún riêu cua", "noodle", [4.5, 10, 2.5], [["1 tô", 600]], ["bun rieu"]),
  f("Bún thịt nướng", "noodle", [7, 18, 4.5], [["1 tô", 400]], ["bun thit nuong cha gio", "bun nem nuong"]),
  f("Bún bò Nam Bộ", "noodle", [7.5, 16, 5], [["1 tô", 400]], ["bun bo xao", "bun bo nam bo"]),
  f("Bún đậu mắm tôm", "noodle", [7, 15, 7.5], [["1 suất", 450], ["1 suất nhỏ", 300]], ["bun dau"]),
  f("Bún mọc", "noodle", [5, 9.5, 2], [["1 tô", 550]]),
  f("Bún cá", "noodle", [5, 9.5, 1.8], [["1 tô", 550]], ["bun ca ro", "bun cha ca"]),
  f("Bún ốc", "noodle", [4.5, 9.5, 1.5], [["1 tô", 550]]),
  f("Bún mắm", "noodle", [5, 9, 3], [["1 tô", 600]]),
  f("Bún thang", "noodle", [6, 10, 2], [["1 tô", 500]]),
  f("Bún tươi (sợi)", "noodle", [1.7, 25, 0.3], [["1 phần", 150], ["1 vắt", 100]], ["bun", "bun tuoi", "bun soi"]),
  f("Hủ tiếu Nam Vang", "noodle", [5, 11, 2], [["1 tô", 550]], ["hu tieu", "hu tiu", "hu tieu nam vang"]),
  f("Hủ tiếu xào", "noodle", [6, 22, 6], [["1 đĩa", 350]], ["hu tiu xao"]),
  f("Mì Quảng", "noodle", [6.5, 13, 3.6], [["1 tô", 500]], ["mi quang"]),
  f("Cao lầu", "noodle", [7, 16, 3.5], [["1 tô", 400]]),
  f("Bánh canh cua", "noodle", [4.5, 12, 2], [["1 tô", 550]], ["banh canh"]),
  f("Bánh canh giò heo", "noodle", [5.5, 11, 3.2], [["1 tô", 600]]),
  f("Bánh đa cua", "noodle", [5, 11, 2.5], [["1 tô", 550]], ["banh da"]),
  f("Miến gà", "noodle", [5, 9, 1.5], [["1 tô", 500]], ["mien"]),
  f("Miến lươn", "noodle", [5.5, 11, 2.6], [["1 tô", 500]]),
  f("Miến xào", "noodle", [5, 22, 6], [["1 đĩa", 300]], ["mien xao cua", "mien xao luon"]),
  f("Mì vằn thắn", "noodle", [5, 11, 2.2], [["1 tô", 500]], ["mi hoanh thanh", "hoanh thanh", "wonton"]),
  f("Mì xào bò", "noodle", [7, 20, 7], [["1 đĩa", 350]], ["mi xao", "mi xao gion"]),
  f("Mì gói (mì tôm)", "noodle", [8.5, 62, 19.5], [["1 gói (khô)", 75], ["1 gói lớn (khô)", 90]], ["mi tom", "mi goi", "mi an lien", "hao hao", "omachi", "instant noodles", "ramen"]),
  f("Mì Ý sốt bò bằm", "western", [7, 18, 5], [["1 đĩa", 350]], ["spaghetti", "mi y", "pasta", "bolognese"]),

  // ── Cơm, xôi, cháo ──
  f("Cơm trắng", "rice", [2.7, 28, 0.3], [["1 chén", 150], ["1 chén đầy", 200], ["1 đĩa", 250]], ["com", "com trang", "bat com", "rice"]),
  f("Cơm gạo lứt", "rice", [2.6, 23, 0.9], [["1 chén", 150]], ["gao lut", "brown rice"]),
  f("Cơm tấm sườn", "rice", [8, 20, 5.5], [["1 đĩa", 400]], ["com tam", "com suon"]),
  f("Cơm tấm sườn bì chả", "rice", [8.5, 19, 6.5], [["1 đĩa", 500]], ["com tam dac biet", "com suon bi cha"]),
  f("Cơm gà xối mỡ", "rice", [9, 19, 7.2], [["1 đĩa", 450]], ["com ga chien"]),
  f("Cơm gà luộc (Hải Nam)", "rice", [8.5, 19, 4], [["1 đĩa", 400]], ["com ga", "com ga hoi an", "com ga hai nam"]),
  f("Cơm bình dân (1 mặn, rau)", "rice", [6.5, 18, 5], [["1 suất", 450], ["1 hộp", 500]], ["com binh dan", "com van phong", "com hop", "com phan", "com bui"]),
  f("Cơm thịt kho trứng", "rice", [8, 16, 7], [["1 suất", 450]], ["com thit kho"]),
  f("Cơm chiên dương châu", "rice", [5, 24, 6.5], [["1 đĩa", 350]], ["com chien", "com rang", "com rang thap cam"]),
  f("Cơm chiên trứng", "rice", [4.5, 25, 6], [["1 đĩa", 350]], ["com rang trung"]),
  f("Cơm rang dưa bò", "rice", [6.5, 22, 6.5], [["1 đĩa", 350]], ["com chien bo"]),
  f("Cơm cuộn (kimbap)", "rice", [5, 27, 4], [["1 cuộn", 250], ["1 miếng", 25]], ["kimbap", "gimbap", "com cuon"]),
  f("Cơm nắm", "rice", [3, 30, 1], [["1 nắm", 120]], ["onigiri"]),
  f("Xôi xéo", "rice", [5, 30, 6], [["1 gói", 200]], ["xoi"]),
  f("Xôi gà", "rice", [7, 28, 6], [["1 gói", 250]]),
  f("Xôi mặn (thập cẩm)", "rice", [7, 27, 7], [["1 hộp", 300], ["1 gói nhỏ", 200]], ["xoi man", "xoi thap cam", "xoi pate"]),
  f("Xôi lạc (đậu phộng)", "rice", [6.5, 32, 6], [["1 gói", 200]], ["xoi dau phong", "xoi lac"]),
  f("Xôi đậu xanh", "rice", [5, 32, 2], [["1 gói", 200]], ["xoi do", "xoi trang"]),
  f("Bánh chưng", "rice", [5.5, 27, 6.5], [["1 miếng (1/8 cái)", 125], ["1/4 cái", 250]], ["banh tet", "banh chung"]),
  f("Cháo trắng", "rice", [1.1, 10, 0.2], [["1 bát", 300]], ["chao"]),
  f("Cháo gà", "rice", [4, 9, 1.5], [["1 tô", 450], ["1 bát", 300]]),
  f("Cháo lòng", "rice", [5, 8, 3], [["1 tô", 450]], ["chao long heo"]),
  f("Cháo sườn", "rice", [3.5, 9, 2], [["1 tô", 400]], ["chao suon sun"]),
  f("Cháo yến mạch", "rice", [2.8, 10, 1.5], [["1 bát", 300]], ["chao oat", "oatmeal", "chao yen mach"]),
  f("Súp cua", "soup", [4, 6, 1.5], [["1 chén", 250]], ["sup", "soup cua"]),

  // ── Bánh mì & các loại bánh ──
  f("Bánh mì thịt", "bread", [9, 24, 9.5], [["1 ổ", 230]], ["banh mi", "banh mi thit", "banh mi pate", "banh mi thap cam", "banh mi dac biet"]),
  f("Bánh mì trứng", "bread", [9, 25, 9], [["1 ổ", 200]], ["banh mi op la", "banh mi trung"]),
  f("Bánh mì xíu mại", "bread", [8, 23, 8.5], [["1 ổ", 280]]),
  f("Bánh mì gà", "bread", [10, 24, 6.5], [["1 ổ", 220]], ["banh mi ga xe"]),
  f("Bánh mì heo quay", "bread", [9.5, 22, 11], [["1 ổ", 230]], ["banh mi thit quay"]),
  f("Bánh mì chả cá", "bread", [8.5, 25, 6.5], [["1 ổ", 220]]),
  f("Bánh mì không", "bread", [9, 51, 2.8], [["1 ổ", 80]], ["banh mi trang", "banh mi khong nhan", "baguette"]),
  f("Bánh mì que", "bread", [8, 40, 9], [["1 cái", 60]]),
  f("Bánh mì chảo", "bread", [11, 15, 12], [["1 phần", 350]], ["op la chao"]),
  f("Bánh mì sandwich (lát)", "bread", [8.5, 49, 3.5], [["1 lát", 30], ["2 lát", 60]], ["banh mi goi", "sandwich bread", "banh mi lat"]),
  f("Bánh mì nguyên cám", "bread", [12, 41, 3.5], [["1 lát", 35], ["2 lát", 70]], ["banh mi den", "whole wheat", "banh mi nguyen cam"]),
  f("Bánh bao nhân thịt", "bread", [7.5, 36, 6.5], [["1 cái", 150], ["1 cái nhỏ", 90]], ["banh bao"]),
  f("Bánh cuốn", "bread", [5, 21, 3], [["1 đĩa", 350], ["1 đĩa nhỏ", 250]], ["banh cuon cha"]),
  f("Bánh ướt", "bread", [3, 20, 2.5], [["1 đĩa", 250]], ["banh uot"]),
  f("Bánh xèo", "bread", [6, 18, 11], [["1 cái", 200], ["1 cái nhỏ (miền Trung)", 80]], ["banh xeo"]),
  f("Bánh khọt", "bread", [5.5, 22, 10], [["1 đĩa (8 cái)", 240], ["1 cái", 30]]),
  f("Bánh bèo", "bread", [3, 20, 3], [["1 đĩa", 250]]),
  f("Bánh bột lọc", "bread", [3.5, 30, 2.5], [["1 đĩa", 250], ["1 cái", 25]], ["banh loc"]),
  f("Bánh giò", "bread", [5, 22, 7], [["1 cái", 180]]),
  f("Bánh tráng trộn", "snack", [4, 30, 9], [["1 bịch", 150]], ["banh trang tron"]),
  f("Bánh tráng nướng", "snack", [6, 30, 10], [["1 cái", 120]], ["pizza viet"]),
  f("Bột chiên", "snack", [4, 28, 10], [["1 đĩa", 300]], ["bot chien trung"]),
  f("Bánh tiêu", "sweet", [6, 45, 15], [["1 cái", 60]]),
  f("Bánh rán / bánh cam", "sweet", [4, 45, 14], [["1 cái", 50]], ["banh ran", "banh cam", "banh vung"]),
  f("Quẩy", "snack", [7, 45, 20], [["1 chiếc", 35]], ["dau chao quay", "gio chao quay"]),

  // ── Cuốn, chả, gỏi ──
  f("Gỏi cuốn", "dish", [6.5, 17, 2], [["1 cuốn", 90], ["2 cuốn", 180]], ["goi cuon", "nem cuon", "spring roll"]),
  f("Bò bía", "dish", [5, 18, 4], [["1 cuốn", 70]], ["bo bia"]),
  f("Chả giò (nem rán)", "dish", [9, 18, 16], [["1 cuốn", 40], ["5 cuốn", 200]], ["cha gio", "nem ran", "nem"]),
  f("Nem chua", "dish", [21.7, 4.3, 3.7], [["1 cái", 30]], ["nem chua thanh hoa"]),
  f("Nem nướng", "dish", [16, 8, 14], [["1 xiên", 40], ["5 xiên", 200]], ["nem nuong nha trang"]),
  f("Chả lụa (giò lụa)", "protein", [21.5, 0, 5.5], [["1 khoanh", 30], ["1 phần", 100]], ["gio lua", "cha lua", "gio"]),
  f("Chả cá", "protein", [14, 8, 8], [["1 miếng", 50]], ["cha ca chien"]),
  f("Cá viên chiên", "snack", [10, 15, 12], [["1 xiên", 60]], ["ca vien", "bo vien chien"]),
  f("Bò viên", "protein", [12, 8, 14], [["5 viên", 75]], ["thit vien"]),
  f("Gỏi gà (nộm gà)", "dish", [9, 6, 4], [["1 đĩa", 200]], ["nom ga", "goi ga bap cai"]),
  f("Gỏi đu đủ khô bò", "dish", [5, 10, 3], [["1 đĩa", 200]], ["nom du du", "goi du du", "nom"]),
  f("Nước mắm chấm", "pantry", [1, 13, 0], [["1 chén nhỏ", 50], ["1 thìa", 15]], ["nuoc mam", "nuoc cham", "mam"]),
  f("Tương chấm gỏi cuốn", "pantry", [6, 25, 9], [["1 chén nhỏ", 40]], ["tuong den", "tuong dau phong", "hoisin"]),

  // ── Món mặn ăn với cơm ──
  f("Thịt kho trứng", "dish", [14, 4, 18], [["1 phần (2 miếng + 1 trứng)", 150]], ["thit kho tau", "thit kho", "thit kho tieu"]),
  f("Cá kho tộ", "dish", [17, 6, 7], [["1 khúc", 100], ["1 phần", 150]], ["ca kho", "ca kho to", "ca kho rieng"]),
  f("Sườn xào chua ngọt", "dish", [15, 10, 15], [["1 phần", 150]], ["suon xao", "suon chua ngot"]),
  f("Sườn nướng", "dish", [22, 6, 14], [["1 miếng", 120]], ["suon cot let", "suon heo nuong"]),
  f("Thịt nướng (heo nướng sả)", "dish", [18, 6, 14], [["1 phần", 100]], ["thit nuong", "heo nuong"]),
  f("Thịt luộc (ba chỉ)", "dish", [16, 0, 21.5], [["1 phần", 100]], ["thit luoc", "ba chi luoc", "ba roi luoc"]),
  f("Thịt ba chỉ nướng", "dish", [18, 1, 32], [["1 phần", 100]], ["ba roi nuong", "ba chi nuong", "samgyeopsal"]),
  f("Thịt rim (nạc)", "dish", [22, 6, 8], [["1 phần", 120]], ["thit rim", "thit nac rim", "thit ram"]),
  f("Gà kho gừng", "dish", [20, 4, 10], [["1 phần", 150]], ["ga kho", "ga rang gung"]),
  f("Gà luộc", "protein", [25, 0, 10], [["1 phần", 150], ["1 đùi", 180]], ["ga luoc", "thit ga"]),
  f("Gà nướng", "dish", [24, 2, 10], [["1 đùi", 150], ["1 phần", 200]], ["ga nuong", "dui ga nuong"]),
  f("Gà rán", "western", [22, 8, 16], [["1 miếng đùi", 130], ["1 miếng cánh", 60]], ["ga ran", "ga chien", "kfc", "fried chicken", "jollibee"]),
  f("Vịt quay", "dish", [19, 2, 20], [["1 phần", 150]], ["vit", "thit vit", "vit nuong"]),
  f("Heo quay", "dish", [18, 0, 28], [["1 phần", 100]], ["thit quay"]),
  f("Bò xào rau", "dish", [10, 4, 7], [["1 đĩa", 200]], ["bo xao", "bo xao can", "bo xao hanh tay", "thit bo xao"]),
  f("Bò lúc lắc", "dish", [20, 5, 13], [["1 phần", 200]], ["bo luc lac"]),
  f("Bò kho", "dish", [10, 5, 6], [["1 tô", 400]], ["bo kho banh mi"]),
  f("Bò bít tết", "western", [22, 2, 15], [["1 miếng", 200]], ["bit tet", "beefsteak", "steak"]),
  f("Cá chiên", "dish", [20, 3, 10], [["1 khúc", 120]], ["ca ran", "ca chien gion"]),
  f("Cá nướng", "dish", [22, 0, 6], [["1 phần", 150]]),
  f("Cá hấp (basa, rô phi, diêu hồng)", "protein", [18, 0, 3.5], [["1 phần", 150]], ["ca hap", "ca basa", "ca ro phi", "ca dieu hong", "ca luoc"]),
  f("Tôm rang", "dish", [20, 3, 6], [["1 phần", 120]], ["tom rim", "tom rang me"]),
  f("Tôm luộc / hấp", "protein", [24, 0.2, 0.3], [["10 con", 100], ["1 phần", 150]], ["tom", "tom luoc", "tom hap", "shrimp"]),
  f("Mực xào", "dish", [14, 6, 6], [["1 đĩa", 200]], ["muc xao", "muc xao chua ngot"]),
  f("Mực hấp", "protein", [16, 3, 1.4], [["1 phần", 150]], ["muc", "muc hap gung", "muc luoc"]),
  f("Nghêu hấp sả", "protein", [14, 5, 1.5], [["1 đĩa (thịt)", 150]], ["ngheu", "ngao", "so"]),
  f("Ốc luộc", "protein", [12, 3, 1], [["1 đĩa (thịt)", 150]], ["oc"]),
  f("Trứng chiên", "dish", [12, 1.5, 15], [["1 quả", 60], ["2 quả", 120]], ["trung chien", "trung ran", "trung chien hanh", "omelette"]),
  f("Trứng ốp la", "dish", [13.5, 0.8, 15], [["1 quả", 50], ["2 quả", 100]], ["op la", "trung op la", "fried egg"]),
  f("Đậu hũ chiên", "dish", [14, 3, 14], [["1 bìa", 100], ["1 miếng", 30]], ["dau phu ran", "dau hu chien", "tau hu chien"]),
  f("Đậu hũ sốt cà chua", "dish", [9, 5, 8], [["1 phần", 200]], ["dau sot ca chua", "dau phu sot ca"]),
  f("Rau muống xào tỏi", "veg", [3, 4, 5], [["1 đĩa", 200]], ["rau muong xao", "rau xao"]),
  f("Cải xào tỏi", "veg", [2, 4, 4], [["1 đĩa", 200]], ["cai xao", "rau cai xao", "cai thia xao"]),
  f("Rau củ xào thập cẩm", "veg", [2.5, 7, 4], [["1 đĩa", 200]], ["dau que xao", "rau cu xao", "su su xao"]),

  // ── Canh, lẩu ──
  f("Canh chua cá", "soup", [3.5, 3, 1], [["1 tô", 300], ["1 chén", 200]], ["canh chua"]),
  f("Canh rau nấu thịt", "soup", [2.5, 1.5, 1.5], [["1 tô", 300], ["1 chén", 200]], ["canh", "canh rau ngot", "canh rau", "canh cai"]),
  f("Canh bí đỏ", "soup", [1.5, 4, 1], [["1 tô", 300]], ["canh bi"]),
  f("Canh bầu nấu tôm", "soup", [2, 2.5, 0.8], [["1 tô", 300]], ["canh bau", "canh muop"]),
  f("Canh khổ qua nhồi thịt", "soup", [4, 2.5, 3], [["1 tô", 350]], ["canh kho qua", "canh muop dang"]),
  f("Canh trứng cà chua", "soup", [2.5, 2, 2], [["1 tô", 300]], ["canh trung"]),
  f("Canh cua rau đay", "soup", [2.5, 2, 1], [["1 tô", 300]], ["canh cua"]),
  f("Lẩu thái (1 phần ăn)", "soup", [6, 4, 4], [["1 phần", 500]], ["lau", "lau thai", "lau hai san", "hotpot"]),
  f("Lẩu bò (1 phần ăn)", "soup", [8, 4, 6], [["1 phần", 500]], ["lau bo", "lau de"]),

  // ── Thịt, cá, trứng, đậu (nguyên liệu) ──
  f("Trứng gà luộc", "protein", [12.6, 1.1, 10.6], [["1 quả", 50], ["2 quả", 100]], ["trung", "trung ga", "trung luoc", "egg"]),
  f("Lòng trắng trứng", "protein", [11, 0.7, 0.2], [["1 quả", 33]], ["long trang", "egg white"]),
  f("Trứng vịt luộc", "protein", [13, 1, 14], [["1 quả", 70]], ["trung vit", "hot vit"]),
  f("Trứng vịt lộn", "protein", [13.6, 4, 12.4], [["1 quả", 70]], ["hot vit lon", "balut"]),
  f("Trứng cút luộc", "protein", [13, 0.4, 11], [["10 quả", 90], ["1 quả", 9]], ["trung cut"]),
  f("Ức gà (chín, bỏ da)", "protein", [31, 0, 4], [["1 miếng", 150], ["1 phần nhỏ", 100]], ["uc ga", "chicken breast", "uc ga luoc", "uc ga ap chao"]),
  f("Ức gà (sống)", "protein", [23, 0, 1.5], [["1 miếng", 200]], ["uc ga song"]),
  f("Thịt bò nạc (chín)", "protein", [28, 0, 8], [["1 phần", 100]], ["thit bo", "bo", "beef"]),
  f("Thịt bò nạc (sống)", "protein", [21, 0, 6], [["1 phần", 150]], ["thit bo song", "bo tai"]),
  f("Thịt heo nạc (chín)", "protein", [27, 0, 7], [["1 phần", 100]], ["thit heo", "thit lon", "thit nac", "pork"]),
  f("Thịt heo nạc (sống)", "protein", [21, 0, 4], [["1 phần", 150]], ["thit lon song", "thit nac song"]),
  f("Thịt ba chỉ (sống)", "protein", [16.5, 0, 21.5], [["1 phần", 100]], ["ba chi", "ba roi", "thit ba chi"]),
  f("Cá hồi (chín)", "protein", [22, 0, 13], [["1 miếng", 150]], ["ca hoi", "salmon", "ca hoi ap chao"]),
  f("Cá hồi sống (sashimi)", "protein", [20, 0, 13], [["1 phần (5 lát)", 75]], ["sashimi", "ca hoi song"]),
  f("Cá ngừ hộp (ngâm nước)", "protein", [25, 0, 1], [["1 hộp (đã chắt)", 120]], ["ca ngu", "tuna"]),
  f("Đậu hũ (đậu phụ tươi)", "protein", [10.9, 0.7, 5.4], [["1 bìa", 100], ["1/2 bìa", 50]], ["dau phu", "dau hu", "tau hu", "tofu"]),
  f("Lạp xưởng", "protein", [14, 13, 33], [["1 cây", 40]], ["lap xuong", "lap xuong chien"]),
  f("Xúc xích", "protein", [11, 4, 22], [["1 cây", 40], ["1 cây lớn", 70]], ["xuc xich", "sausage", "xuc xich nuong"]),
  f("Whey protein", "protein", [78, 8, 6], [["1 muỗng", 30]], ["whey", "protein", "bot protein", "sua whey"]),

  // ── Rau, củ ──
  f("Rau sống / xà lách", "veg", [1.3, 2.9, 0.2], [["1 đĩa", 100]], ["rau song", "xa lach", "rau thom", "lettuce"]),
  f("Rau luộc", "veg", [1.8, 4, 0.3], [["1 đĩa", 200]], ["rau cai luoc", "su su luoc", "bap cai luoc"]),
  f("Rau muống luộc", "veg", [3, 3, 0.2], [["1 đĩa", 200]], ["rau muong"]),
  f("Bông cải xanh luộc", "veg", [2.4, 5, 0.4], [["1 đĩa", 150]], ["bong cai", "sup lo xanh", "broccoli"]),
  f("Dưa leo", "veg", [0.7, 3.6, 0.1], [["1 quả", 150]], ["dua chuot", "cucumber"]),
  f("Cà chua", "veg", [0.9, 3.9, 0.2], [["1 quả", 120]], ["tomato"]),
  f("Cà rốt", "veg", [0.9, 7, 0.2], [["1 củ", 100]], ["ca rot", "carrot"]),
  f("Khoai lang luộc", "veg", [1.4, 17.7, 0.1], [["1 củ", 200], ["1 củ nhỏ", 120]], ["khoai lang", "sweet potato", "khoai lang nuong"]),
  f("Khoai tây luộc", "veg", [1.9, 20, 0.1], [["1 củ", 150]], ["khoai tay", "potato"]),
  f("Khoai mì (sắn) luộc", "veg", [1.2, 36, 0.3], [["1 khúc", 150]], ["khoai mi", "san", "cassava"]),
  f("Bắp (ngô) luộc", "veg", [3.4, 21, 1.5], [["1 trái", 150]], ["bap", "ngo", "bap luoc", "ngo luoc", "corn"]),
  f("Đậu nành Nhật (edamame)", "veg", [11, 4.5, 5], [["1 chén", 100]], ["edamame", "dau nanh"]),
  f("Kim chi", "veg", [1.1, 2.4, 0.5], [["1 chén nhỏ", 50]], ["kimchi"]),
  f("Dưa muối", "veg", [1, 2.5, 0.2], [["1 chén nhỏ", 50]], ["dua cai", "dua chua", "ca phao"]),

  // ── Trái cây (phần ăn được) ──
  f("Chuối", "fruit", [1.1, 21, 0.3], [["1 quả", 100], ["1 quả nhỏ (chuối sứ)", 70]], ["chuoi", "banana"]),
  f("Táo", "fruit", [0.3, 12.5, 0.2], [["1 quả", 180]], ["tao", "apple"]),
  f("Cam", "fruit", [0.9, 10, 0.1], [["1 quả", 150]], ["orange", "quyt"]),
  f("Xoài chín", "fruit", [0.8, 14, 0.4], [["1 quả", 250], ["1 chén cắt", 150]], ["xoai", "mango"]),
  f("Dưa hấu", "fruit", [0.6, 7.5, 0.2], [["1 miếng", 250], ["1 đĩa", 300]], ["dua hau", "watermelon"]),
  f("Đu đủ", "fruit", [0.5, 9, 0.3], [["1 miếng", 200]], ["du du", "papaya"]),
  f("Thanh long", "fruit", [1.2, 11, 0.4], [["1/2 quả", 150], ["1 quả", 300]], ["thanh long", "dragon fruit"]),
  f("Ổi", "fruit", [2.6, 9, 1], [["1 quả", 150]], ["oi", "guava"]),
  f("Bưởi", "fruit", [0.8, 9, 0], [["3 múi", 150]], ["buoi", "pomelo"]),
  f("Nho", "fruit", [0.7, 17, 0.2], [["1 chùm nhỏ", 150]], ["grape"]),
  f("Dứa (thơm)", "fruit", [0.5, 12, 0.1], [["1 đĩa", 150]], ["dua", "thom", "khom", "pineapple"]),
  f("Sầu riêng", "fruit", [1.5, 23, 5.3], [["3 múi", 180], ["1 múi", 60]], ["sau rieng", "durian"]),
  f("Mít", "fruit", [1.7, 21, 0.6], [["5 múi", 120]], ["mit", "jackfruit"]),
  f("Chôm chôm", "fruit", [0.7, 19, 0.2], [["10 quả", 150]], ["chom chom", "rambutan"]),
  f("Vải", "fruit", [0.8, 16.5, 0.4], [["10 quả", 150]], ["vai", "lychee"]),
  f("Nhãn", "fruit", [1.3, 15, 0.1], [["15 quả", 120]], ["nhan", "longan"]),
  f("Măng cụt", "fruit", [0.4, 16, 0.6], [["3 quả", 90]], ["mang cut", "mangosteen"]),
  f("Bơ (quả)", "fruit", [2, 3, 15], [["1/2 quả", 100], ["1 quả", 200]], ["bo", "trai bo", "avocado"]),
  f("Dâu tây", "fruit", [0.7, 7.7, 0.3], [["1 hộp nhỏ", 150]], ["dau tay", "strawberry"]),
  f("Kiwi", "fruit", [1.1, 12, 0.5], [["1 quả", 75]]),
  f("Lê", "fruit", [0.4, 12.5, 0.1], [["1 quả", 200]], ["le", "pear"]),
  f("Mận (roi)", "fruit", [0.6, 5.7, 0.3], [["3 quả", 150]], ["man", "roi", "qua man"]),

  // ── Sữa ──
  f("Sữa tươi có đường", "dairy", [3, 8.4, 3.3], [["1 hộp 180 ml", 180], ["1 ly 250 ml", 250]], ["sua", "sua tuoi", "sua hop", "milk", "vinamilk", "th true milk"]),
  f("Sữa tươi không đường", "dairy", [3.2, 4.8, 3.5], [["1 hộp 180 ml", 180], ["1 ly 250 ml", 250]], ["sua khong duong"]),
  f("Sữa tách béo", "dairy", [3.4, 5, 0.2], [["1 ly 250 ml", 250]], ["sua tach beo", "skim milk"]),
  f("Sữa đậu nành", "dairy", [2.8, 8, 1.6], [["1 hộp 200 ml", 200], ["1 ly 300 ml", 300]], ["sua dau", "fami", "soy milk"]),
  f("Sữa hạt không đường", "dairy", [3, 1.5, 1.8], [["1 hộp 200 ml", 200]], ["sua hat", "sua hanh nhan", "sua oat", "almond milk"]),
  f("Sữa chua", "dairy", [3.3, 13.5, 3], [["1 hộp", 100]], ["sua chua", "yaourt", "yogurt", "da ua"]),
  f("Sữa chua không đường", "dairy", [3.8, 5, 3.3], [["1 hộp", 100]], ["sua chua khong duong"]),
  f("Sữa chua Hy Lạp", "dairy", [10, 4, 0.4], [["1 hộp", 100]], ["greek yogurt", "sua chua hy lap"]),
  f("Sữa chua uống", "dairy", [1.2, 14, 0], [["1 chai 65 ml", 65], ["1 chai 130 ml", 130]], ["yakult", "probi", "sua chua uong"]),
  f("Sữa Milo (hộp)", "dairy", [3, 12, 2], [["1 hộp 180 ml", 180]], ["milo", "ovaltine"]),
  f("Phô mai con bò cười", "dairy", [10, 6, 20], [["1 miếng", 17.5]], ["pho mai", "phomai", "con bo cuoi", "cheese"]),
  f("Phô mai lát", "dairy", [20, 6, 22], [["1 lát", 17]], ["pho mai lat", "cheddar"]),
  f("Sữa đặc", "pantry", [7.9, 54, 8.7], [["1 thìa", 20]], ["sua dac", "ong tho", "condensed milk"]),

  // ── Đồ uống ──
  f("Nước lọc", "drink", [0, 0, 0], [["1 ly 250 ml", 250], ["1 chai 500 ml", 500]], ["nuoc", "nuoc suoi", "nuoc khoang", "nuoc tinh khiet", "water"]),
  f("Trà đá / trà không đường", "drink", [0, 0, 0], [["1 ly", 300]], ["tra", "tra da", "tra nong", "tra xanh", "tra khong duong", "tra tac khong duong", "tea"]),
  f("Cà phê đen không đường", "drink", [0.3, 0, 0], [["1 ly", 150]], ["ca phe den", "cafe den", "americano", "espresso", "black coffee"]),
  f("Cà phê đen đá (có đường)", "drink", [0.2, 7, 0], [["1 ly", 200]], ["cafe den da", "ca phe den da", "ca phe duong"]),
  f("Cà phê sữa đá", "drink", [1.2, 15, 1.3], [["1 ly", 200], ["1 ly lớn", 300]], ["ca phe sua", "cafe sua", "cafe sua da", "caphe", "cafe", "coffee", "nau da"]),
  f("Bạc xỉu", "drink", [2, 17, 2.5], [["1 ly", 250]], ["bac xiu"]),
  f("Cà phê muối", "drink", [1.5, 14, 4], [["1 ly", 250]], ["cafe muoi"]),
  f("Cà phê latte (sữa tươi)", "drink", [2.6, 4, 2.6], [["1 ly M (350 ml)", 350], ["1 ly L (470 ml)", 470]], ["latte", "cappuccino", "flat white", "ca phe sua tuoi"]),
  f("Cà phê đá xay", "drink", [1.5, 14, 3], [["1 ly M (350 ml)", 350], ["1 ly L (470 ml)", 470]], ["da xay", "frappe", "frappuccino", "cookie da xay"]),
  f("Trà sữa trân châu", "drink", [0.8, 16, 2.5], [["1 ly M (500 ml)", 500], ["1 ly L (700 ml)", 700]], ["tra sua", "milk tea", "boba", "tra sua tran chau duong den"]),
  f("Trà sữa (không topping, ít đường)", "drink", [0.8, 9, 2.3], [["1 ly M (500 ml)", 500], ["1 ly L (700 ml)", 700]], ["tra sua it duong", "tra sua khong topping"]),
  f("Trân châu (topping)", "drink", [0, 32, 0.2], [["1 phần", 50]], ["tran chau", "topping", "thach"]),
  f("Sữa tươi trân châu đường đen", "drink", [2.5, 18, 3], [["1 ly M (500 ml)", 500]], ["sua tuoi tran chau", "tran chau duong den"]),
  f("Trà đào / trà trái cây", "drink", [0.1, 11, 0], [["1 ly 500 ml", 500]], ["tra dao", "tra vai", "tra trai cay", "tra dao cam sa"]),
  f("Trà chanh / trà tắc", "drink", [0, 9, 0], [["1 ly 400 ml", 400]], ["tra chanh", "tra tac", "chanh da"]),
  f("Trà xanh đóng chai (có đường)", "drink", [0, 7, 0], [["1 chai 455 ml", 455], ["1 chai 360 ml", 360]], ["c2", "0 do", "khong do", "tra xanh chai", "tra o long"]),
  f("Nước ngọt có ga", "drink", [0, 10.6, 0], [["1 lon 330 ml", 330], ["1 chai 390 ml", 390]], ["nuoc ngot", "coca", "coca cola", "coke", "pepsi", "7up", "sprite", "fanta", "mirinda", "soda"]),
  f("Nước ngọt không đường (zero)", "drink", [0, 0, 0], [["1 lon 330 ml", 330]], ["coca zero", "pepsi zero", "pepsi khong calo", "diet coke", "zero"]),
  f("Nước tăng lực", "drink", [0, 12.5, 0], [["1 chai 330 ml", 330], ["1 lon 250 ml", 250]], ["sting", "red bull", "bo huc", "number 1", "monster"]),
  f("Nước cam vắt", "drink", [0.7, 10.4, 0.2], [["1 ly 250 ml", 250]], ["nuoc cam", "orange juice"]),
  f("Nước ép trái cây", "drink", [0.5, 11, 0.1], [["1 ly 300 ml", 300]], ["nuoc ep", "nuoc ep tao", "nuoc ep dua hau", "juice"]),
  f("Nước mía", "drink", [0.2, 18, 0], [["1 ly", 400], ["1 ly nhỏ", 250]], ["nuoc mia", "sugarcane"]),
  f("Nước dừa", "drink", [0.7, 3.7, 0.2], [["1 trái", 300]], ["nuoc dua", "dua tuoi", "coconut water"]),
  f("Sinh tố bơ", "drink", [2.5, 18, 8], [["1 ly 350 ml", 350]], ["sinh to bo", "avocado smoothie"]),
  f("Sinh tố trái cây", "drink", [1.5, 18, 2], [["1 ly 350 ml", 350]], ["sinh to", "smoothie", "sinh to xoai", "sinh to dau"]),
  f("Bia", "drink", [0.5, 3.6, 0], [["1 lon 330 ml", 330], ["1 chai 450 ml", 450], ["1 cốc bia hơi 500 ml", 500]], ["beer", "bia hoi", "heineken", "tiger", "saigon", "333", "bia lon"], 3.9),
  f("Rượu vang", "drink", [0.1, 2.7, 0], [["1 ly 150 ml", 150]], ["ruou vang", "wine", "vang do"], 10.5),
  f("Rượu mạnh (40 độ)", "drink", [0, 0, 0], [["1 chén 30 ml", 30]], ["ruou", "ruou de", "ruou trang", "vodka", "whisky", "whiskey"], 33),
  f("Soju", "drink", [0, 1, 0], [["1 chén 50 ml", 50], ["1 chai 360 ml", 360]], ["soju"], 13.5),

  // ── Chè, bánh ngọt, tráng miệng ──
  f("Chè đậu xanh / chè đậu", "sweet", [3, 25, 2], [["1 ly", 300]], ["che", "che dau", "che dau do", "che dau xanh", "che dau den"]),
  f("Chè thái / chè thập cẩm", "sweet", [1.5, 25, 4], [["1 ly", 300]], ["che thai", "che thap cam", "che buoi", "che khuc bach"]),
  f("Chè trôi nước", "sweet", [3, 35, 4], [["1 chén", 200]], ["banh troi", "che troi nuoc"]),
  f("Tàu hũ nước đường", "sweet", [3, 15, 1.5], [["1 chén", 250]], ["tao pho", "tau hu", "dau hu nuoc duong", "tofu pudding"]),
  f("Bánh flan", "sweet", [4.5, 20, 4.5], [["1 cái", 100]], ["flan", "caramen", "kem flan"]),
  f("Kem (ice cream)", "sweet", [3.5, 24, 11], [["1 cây", 60], ["1 viên", 50], ["1 hộp nhỏ", 100]], ["kem", "ice cream", "kem que", "kem ly"]),
  f("Bánh bông lan", "sweet", [6, 52, 12], [["1 miếng", 50], ["1 cái (gói)", 30]], ["bong lan", "sponge cake", "banh cupcake", "solite", "chocopie"]),
  f("Bánh kem", "sweet", [4, 45, 16], [["1 miếng", 100]], ["banh kem", "banh sinh nhat", "cake"]),
  f("Bánh Chocopie", "sweet", [4, 66, 16], [["1 cái", 33]], ["chocopie", "choco pie"]),
  f("Bánh trung thu nướng", "sweet", [7, 55, 17], [["1/4 cái", 40], ["1 cái", 150]], ["banh trung thu", "banh nuong", "banh deo"]),
  f("Bánh pía", "sweet", [6, 52, 16], [["1 cái", 100]], ["banh pia"]),
  f("Bánh da lợn", "sweet", [2.5, 45, 4], [["1 miếng", 70]], ["banh da lon"]),
  f("Bánh quy", "sweet", [6, 66, 22], [["1 cái", 10], ["5 cái", 50]], ["banh quy", "cookie", "biscuit", "cosy", "oreo"]),
  f("Bánh croissant", "western", [8, 45, 21], [["1 cái", 60]], ["croissant", "banh sung bo"]),
  f("Bánh donut", "western", [5, 48, 22], [["1 cái", 60]], ["donut", "banh vong"]),

  // ── Ăn vặt ──
  f("Snack khoai tây", "snack", [6.5, 53, 34], [["1 gói nhỏ", 35], ["1 gói lớn", 90]], ["snack", "bim bim", "khoai tay chien goi", "lays", "poca", "oishi", "chips"]),
  f("Bánh gạo", "snack", [7, 80, 7], [["1 gói nhỏ (2 cái)", 15]], ["banh gao", "one one", "ichi"]),
  f("Kẹo", "snack", [0, 95, 2], [["1 viên", 5]], ["keo", "candy"]),
  f("Sô cô la sữa", "snack", [7.5, 57, 30], [["1 thanh", 40], ["1 viên", 10]], ["socola", "chocolate", "so co la", "kitkat"]),
  f("Sô cô la đen (70%)", "snack", [8, 34, 43], [["2 ô", 20], ["1 thanh", 100]], ["socola den", "dark chocolate"]),
  f("Đậu phộng rang", "snack", [25.8, 7.6, 49.2], [["1 nắm", 30]], ["dau phong", "lac", "lac rang", "peanut"]),
  f("Đậu phộng luộc", "snack", [13.5, 12, 22], [["1 nắm", 50]], ["lac luoc", "dau phong luoc"]),
  f("Hạt điều", "snack", [18, 27, 44], [["1 nắm", 30]], ["hat dieu", "cashew"]),
  f("Hạnh nhân", "snack", [21, 10, 50], [["1 nắm", 30]], ["hanh nhan", "almond"]),
  f("Hạt hướng dương", "snack", [21, 11, 51], [["1 bịch nhỏ (đã bóc)", 30]], ["huong duong", "hat dua", "sunflower seeds"]),
  f("Khô bò", "snack", [40, 25, 10], [["1 nắm", 30]], ["kho bo", "beef jerky", "kho ga"]),
  f("Bắp rang bơ", "snack", [9, 52, 26], [["1 hộp vừa", 100], ["1 hộp nhỏ", 50]], ["bap rang", "popcorn", "bong ngo"]),
  f("Tokbokki", "snack", [3.5, 35, 3], [["1 phần", 250]], ["tteokbokki", "banh gao cay"]),
  f("Trái cây sấy", "snack", [1.5, 70, 2], [["1 nắm", 30]], ["mit say", "chuoi say", "trai cay say", "dried fruit"]),

  // ── Món Âu, fast food ──
  f("Pizza", "western", [11, 33, 10], [["1 miếng", 100], ["1 pizza nhỏ (6 miếng)", 450]], ["pizza"]),
  f("Hamburger bò", "western", [13, 24, 12], [["1 cái", 200], ["1 cái nhỏ", 110]], ["hamburger", "burger", "mcdonald", "big mac"]),
  f("Khoai tây chiên", "western", [3.4, 41, 15], [["1 phần vừa", 115], ["1 phần lớn", 155]], ["khoai tay chien", "french fries", "fries"]),
  f("Sandwich kẹp thịt", "western", [11, 26, 9], [["1 cái", 150]], ["sandwich", "banh mi kep"]),
  f("Salad trộn dầu giấm", "western", [1.5, 5, 6], [["1 đĩa", 200]], ["salad", "xa lach tron", "salat"]),
  f("Salad ức gà", "western", [10, 4, 5], [["1 hộp", 300]], ["salad ga", "chicken salad"]),
  f("Sushi", "western", [6, 28, 2], [["1 miếng", 35], ["1 đĩa (8 miếng)", 280]], ["sushi", "nigiri", "maki"]),
  f("Mì ramen Nhật", "western", [5, 12, 3.5], [["1 tô", 600]], ["ramen nhat", "mi ramen"]),
  f("Yến mạch (khô)", "western", [13, 60, 6.5], [["1 phần", 40], ["1/2 chén", 40]], ["yen mach", "oat", "oats", "oatmeal kho"]),
  f("Granola", "western", [10, 60, 18], [["1 chén nhỏ", 50]], ["granola", "muesli"]),
  f("Ngũ cốc ăn sáng", "western", [7, 84, 0.9], [["1 chén", 30]], ["ngu coc", "cereal", "corn flakes"]),

  // ── Gia vị, nguyên liệu ──
  f("Gạo (sống)", "pantry", [7, 77, 0.7], [["1 lon sữa bò", 180]], ["gao", "gao song"]),
  f("Bánh tráng (khô)", "pantry", [3.5, 80, 0.5], [["1 cái", 10]], ["banh trang", "rice paper"]),
  f("Bơ đậu phộng", "pantry", [25, 14, 48], [["1 thìa", 16]], ["bo dau phong", "peanut butter"]),
  f("Mật ong", "pantry", [0.3, 76, 0], [["1 thìa", 21]], ["mat ong", "honey"]),
  f("Đường", "pantry", [0, 100, 0], [["1 thìa cà phê", 5], ["1 muỗng canh", 12]], ["duong", "sugar"]),
  f("Dầu ăn", "pantry", [0, 0, 100], [["1 muỗng canh", 13], ["1 thìa cà phê", 5]], ["dau an", "dau oliu", "mo", "oil"]),
  f("Bơ (butter)", "pantry", [0.9, 0.1, 81], [["1 thìa", 10]], ["bo lat", "butter", "bo thuc vat"]),
  f("Mayonnaise", "pantry", [1, 1, 75], [["1 thìa", 14]], ["mayonnaise", "sot mayonnaise", "mayo"]),
  f("Tương ớt / tương cà", "pantry", [1, 25, 0.2], [["1 thìa", 15]], ["tuong ot", "tuong ca", "ketchup", "chilli sauce"]),
];
