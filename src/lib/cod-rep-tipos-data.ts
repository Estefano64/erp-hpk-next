// Auto-generated from "5. Cod Rep.xlsx".
// Mapeo de cilindros/equipos a su tipo (descripcion_tipo) para detectar la plantilla de evaluación.
// NO editar a mano — regenerar desde el Excel.

export interface TipoCilindro {
  codigo: string;
  nombre: string;
}

export const TIPOS_CILINDRO: Record<string, string> = {
  CHVS: "Cilindro hidráulico vástago simple",
  CHP: "Cilindro hidráulico pivotado",
  CHPDV: "Cilindro hidráulico de pistón de doble vástago",
  CHT: "Cilindro hidráulico telescópico",
  AE: "Acumulador de émbolo",
  AV: "Acumulador de vejiga",
  RD: "Rueda delantera",
  FS: "Freno de servicio",
  SD: "Suspensión delantera",
};

export interface CodRepCatalogo {
  descripcion: string;
  tipo_codigo: string | null;
  descripcion_tipo: string;
  categoria: string | null;
  flota: string | null;
  fabricante: string | null;
  np: string | null;
  posicion: string | null;
}

export const CATALOGO_COD_REP: CodRepCatalogo[] = [
  {
    "descripcion": "CILINDRO DE JACK HYD",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "PER",
    "flota": "PITVIPER 351",
    "fabricante": "EPI",
    "np": "2654472188",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE SUSPENSION POSTERIOR",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "793D",
    "fabricante": "CAT",
    "np": "106-3722",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "844H",
    "fabricante": "CAT",
    "np": "109-8832_844H",
    "posicion": "RH"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "844K",
    "fabricante": "CAT",
    "np": "109-8832_844K",
    "posicion": "RH"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "844H",
    "fabricante": "CAT",
    "np": "109-8833_844H",
    "posicion": "LH"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "844K",
    "fabricante": "CAT",
    "np": "109-8833_844K",
    "posicion": "LH"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "980H",
    "fabricante": "CAT",
    "np": "111-8181",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "980G",
    "fabricante": "CAT",
    "np": "112-5003_980G",
    "posicion": "RH"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "980H",
    "fabricante": "CAT",
    "np": "112-5003_980H",
    "posicion": "RH"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "980G",
    "fabricante": "CAT",
    "np": "112-5004_980G",
    "posicion": "LH"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "980H",
    "fabricante": "CAT",
    "np": "112-5004_980H",
    "posicion": "LH"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE RIPPER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHP",
    "categoria": "MOT",
    "flota": "24M",
    "fabricante": "CAT",
    "np": "113-7754",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE WHEEL LEAN",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "24",
    "fabricante": "CAT",
    "np": "117-0836",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE TOLVA",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHT",
    "categoria": "CAM",
    "flota": "793D",
    "fabricante": "CAT",
    "np": "121-2071",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO TENSOR DE ORUGAS",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "PER",
    "flota": "MD6640",
    "fabricante": "CAT",
    "np": "127-1474",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE RIPPER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHP",
    "categoria": "MOT",
    "flota": "16M",
    "fabricante": "CAT",
    "np": "128-7678",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DESPLAZAMIENTO DE VERTEDERA",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "24",
    "fabricante": "CAT",
    "np": "141-2914",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BLADE TIP",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "24",
    "fabricante": "CAT",
    "np": "143-5988",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "834H",
    "fabricante": "CAT",
    "np": "151-5171",
    "posicion": "RH"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "994F",
    "fabricante": "CAT",
    "np": "155-9068",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "992K",
    "fabricante": "CAT",
    "np": "157-1352",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "988H",
    "fabricante": "CAT",
    "np": "173-8612",
    "posicion": "RH"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "988H",
    "fabricante": "CAT",
    "np": "173-8613",
    "posicion": "LH"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "834H",
    "fabricante": "CAT",
    "np": "175-5521_834H",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "834K",
    "fabricante": "CAT",
    "np": "175-5521_834K",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "797F",
    "fabricante": "CAT",
    "np": "194-6171",
    "posicion": "LH"
  },
  {
    "descripcion": "ACUMULADOR DE DIRECCION",
    "tipo_codigo": "ACU",
    "descripcion_tipo": "AV",
    "categoria": "CAM",
    "flota": "793D",
    "fabricante": "CAT",
    "np": "219-2540",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": null,
    "flota": "988H",
    "fabricante": null,
    "np": "229-9337",
    "posicion": null
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "834H",
    "fabricante": "CAT",
    "np": "234-9000",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE LAMPON",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "950H",
    "fabricante": "CAT",
    "np": "242-4272",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHP",
    "categoria": "TOR",
    "flota": "D8T",
    "fabricante": "CAT",
    "np": "250-5861",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHP",
    "categoria": "TOR",
    "flota": "D11T",
    "fabricante": "CAT",
    "np": "252-0471",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "980H",
    "fabricante": "CAT",
    "np": "261-4949",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "834H",
    "fabricante": "CAT",
    "np": "264-3233",
    "posicion": "LH"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "16M",
    "fabricante": "CAT",
    "np": "267-3863",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "988H",
    "fabricante": "CAT",
    "np": "271-6441",
    "posicion": "NA"
  },
  {
    "descripcion": "FRENO DE SERVICIO Y PARQUEO",
    "tipo_codigo": "FRE",
    "descripcion_tipo": "FS",
    "categoria": "MOT",
    "flota": "24M",
    "fabricante": "CAT",
    "np": "271-9321",
    "posicion": "DEL"
  },
  {
    "descripcion": "FRENO DE SERVICIO Y PARQUEO",
    "tipo_codigo": "FRE",
    "descripcion_tipo": "FS",
    "categoria": "MOT",
    "flota": "24M",
    "fabricante": "CAT",
    "np": "271-9322",
    "posicion": "POS"
  },
  {
    "descripcion": "CILINDRO DE ARTICULACION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "24M",
    "fabricante": "CAT",
    "np": "273-1733",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BLADE LIFT",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHP",
    "categoria": "MOT",
    "flota": "24M",
    "fabricante": "CAT",
    "np": "276-7646",
    "posicion": "NA"
  },
  {
    "descripcion": "ACUMULADOR DE DIRECCION",
    "tipo_codigo": "ACU",
    "descripcion_tipo": "AE",
    "categoria": "CAM",
    "flota": "797F",
    "fabricante": "CAT",
    "np": "277-7219",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "797F",
    "fabricante": "CAT",
    "np": "288-5537",
    "posicion": "RH"
  },
  {
    "descripcion": "CILINDRO DE WHEEL LEAN",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "16M",
    "fabricante": "CAT",
    "np": "289-3054",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE TOLVA",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHT",
    "categoria": "CAM",
    "flota": "797F",
    "fabricante": "CAT",
    "np": "289-8616",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE SUSPENSION POSTERIOR",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "797F",
    "fabricante": "CAT",
    "np": "289-8619",
    "posicion": "RH"
  },
  {
    "descripcion": "CILINDRO DE SUSPENSION POSTERIOR",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "797F",
    "fabricante": "CAT",
    "np": "289-8620",
    "posicion": "LH"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "966H",
    "fabricante": "CAT",
    "np": "314-9336",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE HERRAMIENTA DE GARFIO",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "988K",
    "fabricante": "WBM",
    "np": "317-002-1072",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE VOLTEO",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "994K",
    "fabricante": "CAT",
    "np": "341-6034",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BOOM",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "374FL",
    "fabricante": "CAT",
    "np": "353-6907",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BOOM",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "390DL",
    "fabricante": "CAT",
    "np": "353-9648",
    "posicion": "LH"
  },
  {
    "descripcion": "CILINDRO DE BOOM",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "390DL",
    "fabricante": "CAT",
    "np": "353-9649",
    "posicion": "RH"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "988K",
    "fabricante": "CAT",
    "np": "354-0798",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "988K",
    "fabricante": "CAT",
    "np": "355-7377",
    "posicion": "RH"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "988K",
    "fabricante": "CAT",
    "np": "355-7378",
    "posicion": "LH"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "966M",
    "fabricante": "CAT",
    "np": "359-6691",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BUCKET",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "390DL",
    "fabricante": "CAT",
    "np": "361-2862",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BUCKET",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "374FL",
    "fabricante": "CAT",
    "np": "362-2784",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "988K",
    "fabricante": "CAT",
    "np": "363-0218",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE STICK",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "390DL",
    "fabricante": "CAT",
    "np": "363-1685",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BUCKET",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "374DL",
    "fabricante": "CAT",
    "np": "365-9225",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TOR",
    "flota": "D11T",
    "fabricante": "CAT",
    "np": "367-2258",
    "posicion": "RH"
  },
  {
    "descripcion": "CILINDRO DE STICK",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "336DL",
    "fabricante": "CAT",
    "np": "375-1722",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BLADE TIP",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "16M",
    "fabricante": "CAT",
    "np": "389-9511",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHP",
    "categoria": "MOT",
    "flota": "16M",
    "fabricante": "CAT",
    "np": "389-9512",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "994K",
    "fabricante": "CAT",
    "np": "416-4017",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE VOLTEO",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "994K",
    "fabricante": "CAT",
    "np": "416-4018",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "994K",
    "fabricante": "CAT",
    "np": "416-4020",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE TENSOR DE ORUGA",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "PER",
    "flota": "MD6640",
    "fabricante": "CAT",
    "np": "425-1554",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BUCKET",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "336DL",
    "fabricante": "CAT",
    "np": "434-0194",
    "posicion": "NA"
  },
  {
    "descripcion": "FRENO DE SERVICIO Y PARQUEO",
    "tipo_codigo": "FRE",
    "descripcion_tipo": "FS",
    "categoria": "MOT",
    "flota": "24",
    "fabricante": "CAT",
    "np": "442-1908",
    "posicion": "DEL"
  },
  {
    "descripcion": "FRENO DE SERVICIO Y PARQUEO",
    "tipo_codigo": "FRE",
    "descripcion_tipo": "FS",
    "categoria": "MOT",
    "flota": "24",
    "fabricante": "CAT",
    "np": "442-1909",
    "posicion": "POS"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION DE RIPPER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TOR",
    "flota": "D11",
    "fabricante": "CAT",
    "np": "465-1711",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHP",
    "categoria": "TOR",
    "flota": "D11",
    "fabricante": "CAT",
    "np": "465-2717",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE ARTICULACION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "24",
    "fabricante": "CAT",
    "np": "468-0220",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE RIPPER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHP",
    "categoria": "MOT",
    "flota": "24",
    "fabricante": "CAT",
    "np": "468-0433",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BOOM",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "390FL",
    "fabricante": "CAT",
    "np": "470-7141",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "24",
    "fabricante": "CAT",
    "np": "489-2403",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHP",
    "categoria": "TRU",
    "flota": "844H",
    "fabricante": "CAT",
    "np": "502-5819_H",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHP",
    "categoria": "TRU",
    "flota": "844K",
    "fabricante": "CAT",
    "np": "502-5819_K",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DESPLAZAMIENTO DE VERTEDERA",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "24M",
    "fabricante": "CAT",
    "np": "507-2438",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE SIDESHIFT",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "16M",
    "fabricante": "CAT",
    "np": "509-6996",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE ARTICULACION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "16M",
    "fabricante": "CAT",
    "np": "510-8438",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TOR",
    "flota": "D11T",
    "fabricante": "CAT",
    "np": "517-3767",
    "posicion": "LH"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION DE RIPPER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TOR",
    "flota": "D11T",
    "fabricante": "CAT",
    "np": "521-8411",
    "posicion": "RH"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION DE RIPPER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TOR",
    "flota": "D11T",
    "fabricante": "CAT",
    "np": "521-8420",
    "posicion": "LH"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE RIPPER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TOR",
    "flota": "D11T",
    "fabricante": "CAT",
    "np": "521-8423",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TOR",
    "flota": "D11",
    "fabricante": "CAT",
    "np": "561-6909",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE RIPPER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TOR",
    "flota": "D11",
    "fabricante": "CAT",
    "np": "561-7470",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "994F",
    "fabricante": "CAT",
    "np": "569-5376",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE STICK",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "390DL",
    "fabricante": "CAT",
    "np": "570-1981_DL",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE STICK",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "390FL",
    "fabricante": "CAT",
    "np": "570-1981_FL",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BUCKET",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "374DL",
    "fabricante": "CAT",
    "np": "570-1986",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BUCKET",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "390DL",
    "fabricante": "CAT",
    "np": "582-7096",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE STICK",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "6060FS",
    "fabricante": "CAT",
    "np": "589-2696",
    "posicion": "NA"
  },
  {
    "descripcion": "RUEDA DELANTERA",
    "tipo_codigo": "RUE",
    "descripcion_tipo": "RD",
    "categoria": "CAM",
    "flota": "980E-4SE",
    "fabricante": "KOM",
    "np": "58B3200247SERV",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "980E-4SE",
    "fabricante": "KOM",
    "np": "58B4150120SERV",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "980E-4SE",
    "fabricante": "KOM",
    "np": "58B5000400",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE TOLVA",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHT",
    "categoria": "CAM",
    "flota": "980E-4SE",
    "fabricante": "KOM",
    "np": "58B5001000",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE SUSPENSION DELANTERA",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "SD",
    "categoria": "CAM",
    "flota": "980E-4SE",
    "fabricante": "KOM",
    "np": "58B5040351",
    "posicion": "NA"
  },
  {
    "descripcion": "ACUMULADOR DE DIRECCION",
    "tipo_codigo": "ACU",
    "descripcion_tipo": "AE",
    "categoria": "CAM",
    "flota": "980E-4SE",
    "fabricante": "KOM",
    "np": "58B6020061",
    "posicion": "NA"
  },
  {
    "descripcion": "RUEDA DELANTERA",
    "tipo_codigo": "RUE",
    "descripcion_tipo": "RD",
    "categoria": "CAM",
    "flota": "930E-4SE",
    "fabricante": "KOM",
    "np": "58F3240013SERV",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BUCKET",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "390FL",
    "fabricante": "CAT",
    "np": "590-8059",
    "posicion": "RH"
  },
  {
    "descripcion": "CILINDRO DE BOOM",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "6060FS",
    "fabricante": "CAT",
    "np": "598-1519",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE STICK",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "349",
    "fabricante": "CAT",
    "np": "599-6994",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE RIPPER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHP",
    "categoria": "MOT",
    "flota": "24",
    "fabricante": "CAT",
    "np": "605-8762",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "16M",
    "fabricante": "CAT",
    "np": "605-8769",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE WHEEL LEAN",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "24M",
    "fabricante": "CAT",
    "np": "605-8793",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BLADE TIP",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "24",
    "fabricante": "CAT",
    "np": "605-8794_24",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BLADE TIP",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "24M",
    "fabricante": "CAT",
    "np": "605-8794_24M",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BLADE LIFT",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHP",
    "categoria": "MOT",
    "flota": "24",
    "fabricante": "CAT",
    "np": "605-8795",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BLADE LIFT",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHP",
    "categoria": "MOT",
    "flota": "24M",
    "fabricante": "CAT",
    "np": "605-8795_M",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE ARTICULACION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "MOT",
    "flota": "24",
    "fabricante": "CAT",
    "np": "605-8796",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "844H",
    "fabricante": "CAT",
    "np": "6E-1244_H",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "844K",
    "fabricante": "CAT",
    "np": "6E-1244_K",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "WA900",
    "fabricante": "KOM",
    "np": "707-01-03212",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "WA900",
    "fabricante": "KOM",
    "np": "707-01-07580",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "HD1500",
    "fabricante": "KOM",
    "np": "707010F502",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TOR",
    "flota": "D475",
    "fabricante": "KOM",
    "np": "7070-10-F521",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BOOM",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "PC1250",
    "fabricante": "KOM",
    "np": "707-F1-01380",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE BOOM",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "PC1250",
    "fabricante": "KOM",
    "np": "707G105170",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE VOLTEO DE BUCKET",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "PC1250",
    "fabricante": "KOM",
    "np": "707G105230",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE BULLDOZER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHP",
    "categoria": "TOR",
    "flota": "D475",
    "fabricante": "KOM",
    "np": "707G300180SG",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE STICK",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "EXC",
    "flota": "PC2000",
    "fabricante": "KOM",
    "np": "707H105780",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE RIPPER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TOR",
    "flota": "D475",
    "fabricante": "KOM",
    "np": "707H106340SG",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE VOLTEO DE RIPPER",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TOR",
    "flota": "D475",
    "fabricante": "KOM",
    "np": "707-H1-06360",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE GARRA",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "TRU",
    "flota": "FMA",
    "fabricante": "WBM",
    "np": "8011C0",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "793D",
    "fabricante": "CAT",
    "np": "9T-8912",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE SUSPENSION POSTERIOR",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "830DC",
    "fabricante": "KOM",
    "np": "EJ2176",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "830AC",
    "fabricante": "KOM",
    "np": "EK1677",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE TOLVA",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHT",
    "categoria": "CAM",
    "flota": "HD1500",
    "fabricante": "KOM",
    "np": "EL4835",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "830E",
    "fabricante": "KOM",
    "np": "EL7952",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE SUSPENSION POSTERIOR",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "HD1500",
    "fabricante": "KOM",
    "np": "EL7969",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE DIRECCION",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "930E-4SE",
    "fabricante": "KOM",
    "np": "EM0241",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE TOLVA",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHT",
    "categoria": "CAM",
    "flota": "930E-4SE",
    "fabricante": "KOM",
    "np": "EM8355",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE SUSPENSION POSTERIOR",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "830E",
    "fabricante": "KOM",
    "np": "EM8841",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE SUSPENSION POSTERIOR",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHVS",
    "categoria": "CAM",
    "flota": "930E-4SE",
    "fabricante": "KOM",
    "np": "EM8844",
    "posicion": "NA"
  },
  {
    "descripcion": "ACUMULADOR DE DIRECCION",
    "tipo_codigo": "ACU",
    "descripcion_tipo": "AV",
    "categoria": null,
    "flota": "830E",
    "fabricante": null,
    "np": "PC1811",
    "posicion": "NA"
  },
  {
    "descripcion": "ACUMULADOR DE DIRECCION",
    "tipo_codigo": "ACU",
    "descripcion_tipo": "AV",
    "categoria": "CAM",
    "flota": "930E-4SE",
    "fabricante": "KOM",
    "np": "PC2732",
    "posicion": "NA"
  },
  {
    "descripcion": "ACUMULADOR DE FRENO",
    "tipo_codigo": "ACU",
    "descripcion_tipo": "AV",
    "categoria": null,
    "flota": "930E-4SE",
    "fabricante": null,
    "np": "SAP5021673",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE LEVANTE DE TOLVA",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "CHT",
    "categoria": "CAM",
    "flota": "830E",
    "fabricante": "KOM",
    "np": "TY5936",
    "posicion": "NA"
  },
  {
    "descripcion": "CILINDRO DE SUSPENSION DELANTERA",
    "tipo_codigo": "CIL",
    "descripcion_tipo": "SD",
    "categoria": "CAM",
    "flota": "930E-4SE",
    "fabricante": "KOM",
    "np": "XB3916",
    "posicion": "NA"
  }
];
