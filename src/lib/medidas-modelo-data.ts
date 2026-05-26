// AUTO-GENERADO desde MEDIDAS2.xlsx por scripts/_generate-medidas-modelo.mjs
// NO EDITAR A MANO. Regenerar con: node scripts/_generate-medidas-modelo.mjs

export interface MedidaModeloCilindro {
  diamInterior: number | null;
  diamSalida: number | null;
  diamExterior: number | null;
  longBrunido: number | null;
  longTotal: number | null;
  diamOjo: number | null;
  diamIntCojinete: number | null;
  anchoOjo: number | null;
}

export interface MedidaModeloVastago {
  diamVastago: number | null;
  longCromo: number | null;
  longTotal: number | null;
  diamEspiga: number | null;
  longEspiga: number | null;
  diamExtOjo: number | null;
  diamIntOjo: number | null;
  anchoOjo: number | null;
  diamIntCojinete: number | null;
}

export interface MedidaModeloCuerpoIntermedio {
  longCromo: number | null;
  longBrunido: number | null;
  diamIntC1: number | null;
  diamIntC2: number | null;
  diamExtC1: number | null;
  diamExtC2: number | null;
}

export interface MedidaModeloTapa {
  exterior: number | null;
  interior: number | null;
  sellado: number | null;
  longTotal: number | null;
}

export interface MedidaModeloPiston {
  exterior: number | null;
  interior: number | null;
  longitud: number | null;
}

export interface MedidaModelo {
  np1: string | null;
  np2: string | null;
  sistema: string;
  descripcion: string | null;
  marca: string | null;
  modelo: string | null;
  cilindro: MedidaModeloCilindro;
  vastago: MedidaModeloVastago;
  cuerpoIntermedio: MedidaModeloCuerpoIntermedio;
  tapa: MedidaModeloTapa;
  piston: MedidaModeloPiston;
}

export const MEDIDAS_MODELO: MedidaModelo[] = [
  {
    "np1": "468-0220",
    "np2": "605-8796",
    "sistema": "mm",
    "descripcion": "CILINDRO DE ARTICULACION",
    "marca": "CAT",
    "modelo": "24",
    "cilindro": {
      "diamInterior": 150,
      "diamSalida": 150,
      "diamExterior": 177,
      "longBrunido": 779,
      "longTotal": 912.75,
      "diamOjo": 76.25,
      "diamIntCojinete": 64.5,
      "anchoOjo": 97.85
    },
    "vastago": {
      "diamVastago": 75,
      "longCromo": 785,
      "longTotal": 955,
      "diamEspiga": 47.55,
      "longEspiga": 98,
      "diamExtOjo": 76.2,
      "diamIntOjo": 63.7,
      "anchoOjo": 96.5,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 180.2,
      "interior": 75.6,
      "sellado": 149.85,
      "longTotal": 97.2
    },
    "piston": {
      "exterior": 148.9,
      "interior": 47.7,
      "longitud": 75
    }
  },
  {
    "np1": "276-7646",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE BLADELIFT",
    "marca": "CAT",
    "modelo": "24M",
    "cilindro": {
      "diamInterior": 133.35,
      "diamSalida": 138.9126,
      "diamExterior": 158.75,
      "longBrunido": 1196.975,
      "longTotal": 1263.65,
      "diamOjo": null,
      "diamIntCojinete": 88.9,
      "anchoOjo": 65.532
    },
    "vastago": {
      "diamVastago": 76.2,
      "longCromo": 1123.95,
      "longTotal": 1346.2,
      "diamEspiga": 57.15,
      "longEspiga": 118.3386,
      "diamExtOjo": 187.96,
      "diamIntOjo": null,
      "anchoOjo": null,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 160.02,
      "interior": 76.5048,
      "sellado": 138.8872,
      "longTotal": 96.6724
    },
    "piston": {
      "exterior": 132.842,
      "interior": 57.1754,
      "longitud": 62.611
    }
  },
  {
    "np1": "141-2914",
    "np2": "507-2438",
    "sistema": "in",
    "descripcion": "CILINDRO DE DESPLAZAMIENTO DE VERTEDERA",
    "marca": "CAT",
    "modelo": "24",
    "cilindro": {
      "diamInterior": 127,
      "diamSalida": 127,
      "diamExterior": 152.4,
      "longBrunido": 2235.2,
      "longTotal": 2451.1,
      "diamOjo": 90.17,
      "diamIntCojinete": null,
      "anchoOjo": 69.85
    },
    "vastago": {
      "diamVastago": 82.55,
      "longCromo": 2514.6,
      "longTotal": 2806.7,
      "diamEspiga": 50.7492,
      "longEspiga": 110.617,
      "diamExtOjo": 139.7,
      "diamIntOjo": 57.15,
      "anchoOjo": 176.53,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 209.931,
      "interior": 83.5914,
      "sellado": 126.746,
      "longTotal": 166.624
    },
    "piston": {
      "exterior": 126.4666,
      "interior": 50.8254,
      "longitud": 61.976
    }
  },
  {
    "np1": "TY5936",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE LEVANTE DE TOLVA",
    "marca": "KOM",
    "modelo": "830",
    "cilindro": {
      "diamInterior": 355.6,
      "diamSalida": 355.6,
      "diamExterior": 406.4,
      "longBrunido": 1095.375,
      "longTotal": 1238.25,
      "diamOjo": 158.75,
      "diamIntCojinete": 101.6,
      "anchoOjo": 101.6
    },
    "vastago": {
      "diamVastago": 177.8,
      "longCromo": 1130.3,
      "longTotal": 1409.7,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 306.4002,
      "diamIntOjo": 209.7278,
      "anchoOjo": 100.1014,
      "diamIntCojinete": 139.7
    },
    "cuerpoIntermedio": {
      "longCromo": 1203.325,
      "longBrunido": 1050.925,
      "diamIntC1": 292.1,
      "diamIntC2": 241.3,
      "diamExtC1": 330.2,
      "diamExtC2": 266.7
    },
    "tapa": {
      "exterior": 406.4,
      "interior": 331.0636,
      "sellado": null,
      "longTotal": 140.9954
    },
    "piston": {
      "exterior": 253.0856,
      "interior": 177.8,
      "longitud": 177.8
    }
  },
  {
    "np1": "113-7754",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE LEVANTE DE RIPPER",
    "marca": "CAT",
    "modelo": "24M",
    "cilindro": {
      "diamInterior": 101.6,
      "diamSalida": 107.188,
      "diamExterior": 117.4242,
      "longBrunido": 612.775,
      "longTotal": 679.45,
      "diamOjo": null,
      "diamIntCojinete": null,
      "anchoOjo": null
    },
    "vastago": {
      "diamVastago": 50.8,
      "longCromo": 609.6,
      "longTotal": 673.1,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 130.175,
      "diamIntOjo": 76.2,
      "anchoOjo": 63.5,
      "diamIntCojinete": 63.5
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 116.713,
      "interior": 51.1556,
      "sellado": 106.934,
      "longTotal": 96.52
    },
    "piston": {
      "exterior": 101.092,
      "interior": 50.038,
      "longitud": 50.9016
    }
  },
  {
    "np1": "489-2403",
    "np2": "489-2406",
    "sistema": "mm",
    "descripcion": "CILINDRO DE DIRECCION",
    "marca": "CAT",
    "modelo": "24M",
    "cilindro": {
      "diamInterior": 88.9,
      "diamSalida": 88.9,
      "diamExterior": 105.8418,
      "longBrunido": 561.975,
      "longTotal": 711.2,
      "diamOjo": 76.2,
      "diamIntCojinete": null,
      "anchoOjo": 70.358
    },
    "vastago": {
      "diamVastago": 63.5,
      "longCromo": 565.15,
      "longTotal": 717.55,
      "diamEspiga": null,
      "longEspiga": 71.501,
      "diamExtOjo": 129.8956,
      "diamIntOjo": 71.12,
      "anchoOjo": 46.99,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 120.65,
      "interior": 64.1604,
      "sellado": 88.7984,
      "longTotal": 90.805
    },
    "piston": {
      "exterior": 88.392,
      "interior": null,
      "longitud": 68.326
    }
  },
  {
    "np1": "507-2438",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE DESPLAZAMIENTO DE VERTEDERA",
    "marca": "CAT",
    "modelo": "24M",
    "cilindro": {
      "diamInterior": 127,
      "diamSalida": 127,
      "diamExterior": 152.4,
      "longBrunido": 2235.2,
      "longTotal": 2444.75,
      "diamOjo": 90.17,
      "diamIntCojinete": null,
      "anchoOjo": 152.4
    },
    "vastago": {
      "diamVastago": 82.55,
      "longCromo": 2514.6,
      "longTotal": 2806.7,
      "diamEspiga": 50.75,
      "longEspiga": 110.61,
      "diamExtOjo": 152.4,
      "diamIntOjo": 57.15,
      "anchoOjo": 35.08,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 209.042,
      "interior": 82.8802,
      "sellado": 108.5596,
      "longTotal": 166.116
    },
    "piston": {
      "exterior": 126.5682,
      "interior": 50.8762,
      "longitud": 62.23
    }
  },
  {
    "np1": "117-0836",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE WHEEL LEAN",
    "marca": "CAT",
    "modelo": "24",
    "cilindro": {
      "diamInterior": 120.65,
      "diamSalida": 120.65,
      "diamExterior": 146.05,
      "longBrunido": 382.5748,
      "longTotal": 481.0252,
      "diamOjo": 69.85,
      "diamIntCojinete": 57.3024,
      "anchoOjo": 65.532
    },
    "vastago": {
      "diamVastago": 63.5,
      "longCromo": 343.7128,
      "longTotal": 450.0118,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 162.7124,
      "diamIntOjo": 114.3,
      "anchoOjo": 75.438,
      "diamIntCojinete": 101.1936
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 151.384,
      "interior": 63.9572,
      "sellado": 125.984,
      "longTotal": 97.6884
    },
    "piston": {
      "exterior": 120.142,
      "interior": 37.719,
      "longitud": 50.0888
    }
  },
  {
    "np1": "143-5988",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE BLADE TIP",
    "marca": "CAT",
    "modelo": "24",
    "cilindro": {
      "diamInterior": 120.65,
      "diamSalida": 126.492,
      "diamExterior": 146.304,
      "longBrunido": 425.45,
      "longTotal": 539.75,
      "diamOjo": 69.85,
      "diamIntCojinete": 57.15,
      "anchoOjo": 63.5
    },
    "vastago": {
      "diamVastago": 63.5,
      "longCromo": 425.45,
      "longTotal": 501.65,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 130.302,
      "diamIntOjo": 69.85,
      "anchoOjo": 63.5,
      "diamIntCojinete": 57.15
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 155.575,
      "interior": 64.135,
      "sellado": 125.9078,
      "longTotal": 98.044
    },
    "piston": {
      "exterior": 120.142,
      "interior": 63.5508,
      "longitud": 50.292
    }
  },
  {
    "np1": "375-1722",
    "np2": null,
    "sistema": "mm",
    "descripcion": "CILINDRO DE STICK",
    "marca": "CAT",
    "modelo": "336DL",
    "cilindro": {
      "diamInterior": 170,
      "diamSalida": 170,
      "diamExterior": 204,
      "longBrunido": 1900,
      "longTotal": 2085,
      "diamOjo": 106.1,
      "diamIntCojinete": 90,
      "anchoOjo": 150
    },
    "vastago": {
      "diamVastago": 115,
      "longCromo": 1890,
      "longTotal": 2312,
      "diamEspiga": 90,
      "longEspiga": 293,
      "diamExtOjo": 181,
      "diamIntOjo": 105.95,
      "anchoOjo": 150,
      "diamIntCojinete": 90.15
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 252,
      "interior": 115.65,
      "sellado": 169.9,
      "longTotal": 196.6
    },
    "piston": {
      "exterior": 168.9,
      "interior": 90.05,
      "longitud": 92.8
    }
  },
  {
    "np1": "363-1685",
    "np2": "570-1981_DL",
    "sistema": "mm",
    "descripcion": "CILINDRO DE STICK",
    "marca": "CAT",
    "modelo": "390DL",
    "cilindro": {
      "diamInterior": 220,
      "diamSalida": 220,
      "diamExterior": 274,
      "longBrunido": 2515,
      "longTotal": 2820,
      "diamOjo": 154,
      "diamIntCojinete": 130,
      "anchoOjo": 170
    },
    "vastago": {
      "diamVastago": 150,
      "longCromo": 2486,
      "longTotal": 3095,
      "diamEspiga": 119,
      "longEspiga": 425,
      "diamExtOjo": 154,
      "diamIntOjo": 154,
      "anchoOjo": 170.2,
      "diamIntCojinete": 130
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 351.6,
      "interior": 150.7,
      "sellado": 219.9,
      "longTotal": 250.3
    },
    "piston": {
      "exterior": 218.9,
      "interior": 120.15,
      "longitud": 117.25
    }
  },
  {
    "np1": "353-9649",
    "np2": "353-9648",
    "sistema": "mm",
    "descripcion": "CILINDRO DE BOOM",
    "marca": "CAT",
    "modelo": "390DL",
    "cilindro": {
      "diamInterior": 210,
      "diamSalida": 210,
      "diamExterior": 258,
      "longBrunido": 2160,
      "longTotal": 2435,
      "diamOjo": 180,
      "diamIntCojinete": 150,
      "anchoOjo": 170
    },
    "vastago": {
      "diamVastago": 145,
      "longCromo": 2120,
      "longTotal": 2590,
      "diamEspiga": 109.9,
      "longEspiga": 275,
      "diamExtOjo": 275,
      "diamIntOjo": 180,
      "anchoOjo": 171.5,
      "diamIntCojinete": 150
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 301.5,
      "interior": 145.7,
      "sellado": 209.9,
      "longTotal": 213.2
    },
    "piston": {
      "exterior": 208.9,
      "interior": 109.95,
      "longitud": 101.3
    }
  },
  {
    "np1": "9T-8912",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE DIRECCION",
    "marca": "CAT",
    "modelo": "793D",
    "cilindro": {
      "diamInterior": 139.7,
      "diamSalida": 139.7,
      "diamExterior": 165.1,
      "longBrunido": 874.7252,
      "longTotal": 1066.8,
      "diamOjo": 111.125,
      "diamIntCojinete": null,
      "anchoOjo": 75.184
    },
    "vastago": {
      "diamVastago": 69.85,
      "longCromo": 908.05,
      "longTotal": 1155.7,
      "diamEspiga": 50.7492,
      "longEspiga": 130.175,
      "diamExtOjo": 197.231,
      "diamIntOjo": 111.125,
      "anchoOjo": 73.66,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 248.92,
      "interior": 70.485,
      "sellado": 139.5984,
      "longTotal": 95.25
    },
    "piston": {
      "exterior": 139.192,
      "interior": 50.8254,
      "longitud": 59.944
    }
  },
  {
    "np1": "121-2071",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE LEVANTE DE TOLVA",
    "marca": "CAT",
    "modelo": "793D",
    "cilindro": {
      "diamInterior": 323.85,
      "diamSalida": 323.85,
      "diamExterior": 381,
      "longBrunido": 1422.4,
      "longTotal": 1612.9,
      "diamOjo": 381,
      "diamIntCojinete": 114.554,
      "anchoOjo": 101.854
    },
    "vastago": {
      "diamVastago": 196.85,
      "longCromo": 1450.975,
      "longTotal": 1689.1,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 313.69,
      "diamIntOjo": 210.185,
      "anchoOjo": 92.583,
      "diamIntCojinete": 139.954
    },
    "cuerpoIntermedio": {
      "longCromo": 1508.125,
      "longBrunido": 1377.95,
      "diamIntC1": 254,
      "diamIntC2": null,
      "diamExtC1": 431.8,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 280.416,
      "interior": 197.485,
      "sellado": 253.3396,
      "longTotal": 163.703
    },
    "piston": {
      "exterior": 253.4412,
      "interior": 196.9516,
      "longitud": 134.9248
    }
  },
  {
    "np1": "106-3722",
    "np2": "295-5709",
    "sistema": "in",
    "descripcion": "CILINDRO DE SUSPENSION POSTERIOR",
    "marca": "CAT",
    "modelo": "793D",
    "cilindro": {
      "diamInterior": 361.95,
      "diamSalida": 361.95,
      "diamExterior": 400.05,
      "longBrunido": 355.6,
      "longTotal": 914.4,
      "diamOjo": 203.2,
      "diamIntCojinete": 139.7,
      "anchoOjo": 122.1994
    },
    "vastago": {
      "diamVastago": 317.5,
      "longCromo": 381,
      "longTotal": 762,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 306.4002,
      "diamIntOjo": 203.2,
      "anchoOjo": 123.19,
      "diamIntCojinete": 127
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 439.7502,
      "interior": 318.0334,
      "sellado": 361.8992,
      "longTotal": 152.4
    },
    "piston": {
      "exterior": 360.9594,
      "interior": null,
      "longitud": 119.38
    }
  },
  {
    "np1": "288-5537",
    "np2": "194-6171",
    "sistema": "in",
    "descripcion": "CILINDRO DE DIRECCION",
    "marca": "CAT",
    "modelo": "797F",
    "cilindro": {
      "diamInterior": 177.8,
      "diamSalida": 177.8,
      "diamExterior": 219.075,
      "longBrunido": 952.5,
      "longTotal": 1168.4,
      "diamOjo": 111.125,
      "diamIntCojinete": 98.425,
      "anchoOjo": 101.473
    },
    "vastago": {
      "diamVastago": 88.9,
      "longCromo": 1028.7,
      "longTotal": 1352.55,
      "diamEspiga": 63.2206,
      "longEspiga": 152.4,
      "diamExtOjo": 257.9878,
      "diamIntOjo": 149.225,
      "anchoOjo": 100.076,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 302.26,
      "interior": 89.2048,
      "sellado": 177.6984,
      "longTotal": 117.856
    },
    "piston": {
      "exterior": 177.292,
      "interior": 63.627,
      "longitud": 77.8256
    }
  },
  {
    "np1": "289-8619",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE SUSPENSION POSTERIOR",
    "marca": "CAT",
    "modelo": "797F",
    "cilindro": {
      "diamInterior": 425.45,
      "diamSalida": 501.65,
      "diamExterior": 501.65,
      "longBrunido": 355.6,
      "longTotal": 698.5,
      "diamOjo": null,
      "diamIntCojinete": 171.45,
      "anchoOjo": 186.182
    },
    "vastago": {
      "diamVastago": 381,
      "longCromo": 374.142,
      "longTotal": 793.75,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 361.95,
      "diamIntOjo": null,
      "anchoOjo": 186.309,
      "diamIntCojinete": 171.5516
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 501.65,
      "interior": 382.27,
      "sellado": 425.323,
      "longTotal": 152.273
    },
    "piston": {
      "exterior": 424.307,
      "interior": null,
      "longitud": 118.999
    }
  },
  {
    "np1": "289-8616",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE LEVANTE DE TOLVA",
    "marca": "CAT",
    "modelo": "797F",
    "cilindro": {
      "diamInterior": 374.65,
      "diamSalida": 374.65,
      "diamExterior": 431.8,
      "longBrunido": 1676.4,
      "longTotal": 1905,
      "diamOjo": 228.6,
      "diamIntCojinete": 160.3502,
      "anchoOjo": 102.9716
    },
    "vastago": {
      "diamVastago": 247.65,
      "longCromo": 1733.55,
      "longTotal": 2009.521,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 209.55,
      "diamIntOjo": null,
      "anchoOjo": 134.62,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": 1638.3,
      "longBrunido": 1689.1,
      "diamIntC1": 304.8,
      "diamIntC2": null,
      "diamExtC1": 330.2,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 495.3,
      "interior": 343.3572,
      "sellado": 374.523,
      "longTotal": 147.955
    },
    "piston": {
      "exterior": 304.292,
      "interior": 247.904,
      "longitud": 160.02
    }
  },
  {
    "np1": "264-3233",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "marca": "CAT",
    "modelo": "834H",
    "cilindro": {
      "diamInterior": 139.7,
      "diamSalida": 139.7,
      "diamExterior": 165.5064,
      "longBrunido": 393.7,
      "longTotal": 742.95,
      "diamOjo": 82.55,
      "diamIntCojinete": 70.2564,
      "anchoOjo": 173.99
    },
    "vastago": {
      "diamVastago": 69.85,
      "longCromo": 406.4,
      "longTotal": 669.925,
      "diamEspiga": 44.45,
      "longEspiga": 133.858,
      "diamExtOjo": 167.4876,
      "diamIntOjo": null,
      "anchoOjo": 91.2876,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 235.7628,
      "interior": 70.2818,
      "sellado": 139.5984,
      "longTotal": 115.062
    },
    "piston": {
      "exterior": 138.684,
      "interior": 44.4754,
      "longitud": 74.0918
    }
  },
  {
    "np1": "175-5521_834K",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE DIRECCION",
    "marca": "CAT",
    "modelo": "834K",
    "cilindro": {
      "diamInterior": 114.3,
      "diamSalida": 119.84,
      "diamExterior": 70.26,
      "longBrunido": 882.65,
      "longTotal": 1066.8,
      "diamOjo": 100.18,
      "diamIntCojinete": 63.65,
      "anchoOjo": 70.26
    },
    "vastago": {
      "diamVastago": 69.77,
      "longCromo": 939.8,
      "longTotal": 1028.7,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 160.33,
      "diamIntOjo": 64.26,
      "anchoOjo": 70.23,
      "diamIntCojinete": 63.58
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 147.52,
      "interior": 70.18,
      "sellado": 119.63,
      "longTotal": null
    },
    "piston": {
      "exterior": 113.79,
      "interior": 69.95,
      "longitud": 69.6
    }
  },
  {
    "np1": "502-5819_H",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE LEVANTE DE BULLDOZER",
    "marca": "CAT",
    "modelo": "844H",
    "cilindro": {
      "diamInterior": 133.35,
      "diamSalida": 133.35,
      "diamExterior": 156.0322,
      "longBrunido": 1644.65,
      "longTotal": 1727.2,
      "diamOjo": null,
      "diamIntCojinete": null,
      "anchoOjo": 46
    },
    "vastago": {
      "diamVastago": 76.2,
      "longCromo": 1701.8,
      "longTotal": 1917.7,
      "diamEspiga": 44.4,
      "longEspiga": 121.67,
      "diamExtOjo": null,
      "diamIntOjo": null,
      "anchoOjo": null,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 169.42,
      "interior": 76.66,
      "sellado": 133.24,
      "longTotal": 131.699
    },
    "piston": {
      "exterior": 132.8166,
      "interior": 44.5262,
      "longitud": 70.74
    }
  },
  {
    "np1": "109-8833_844H",
    "np2": "516-8027",
    "sistema": "in",
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "marca": "CAT",
    "modelo": "844H",
    "cilindro": {
      "diamInterior": 209.55,
      "diamSalida": 209.55,
      "diamExterior": 241.3,
      "longBrunido": 355.6,
      "longTotal": 920.75,
      "diamOjo": 90.17,
      "diamIntCojinete": 57.15,
      "anchoOjo": 173.228
    },
    "vastago": {
      "diamVastago": 88.9,
      "longCromo": 501.65,
      "longTotal": 838.2,
      "diamEspiga": 69.85,
      "longEspiga": 142.875,
      "diamExtOjo": 221.0562,
      "diamIntOjo": 206.375,
      "anchoOjo": 108.077,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 323.596,
      "interior": 89.2302,
      "sellado": 126.746,
      "longTotal": 164.5158
    },
    "piston": {
      "exterior": 209.042,
      "interior": 69.8754,
      "longitud": 73.025
    }
  },
  {
    "np1": "109-8832_844H",
    "np2": "516-8026",
    "sistema": "in",
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "marca": "CAT",
    "modelo": "844H",
    "cilindro": {
      "diamInterior": 209.55,
      "diamSalida": 209.55,
      "diamExterior": 241.3,
      "longBrunido": 355.6,
      "longTotal": 920.75,
      "diamOjo": 90.17,
      "diamIntCojinete": 57.15,
      "anchoOjo": 173.228
    },
    "vastago": {
      "diamVastago": 88.9,
      "longCromo": 501.65,
      "longTotal": 838.2,
      "diamEspiga": 69.85,
      "longEspiga": 142.875,
      "diamExtOjo": 221.0562,
      "diamIntOjo": 206.375,
      "anchoOjo": 108.077,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 323.596,
      "interior": 89.2302,
      "sellado": 126.746,
      "longTotal": 164.5158
    },
    "piston": {
      "exterior": 209.042,
      "interior": 69.8754,
      "longitud": 73.025
    }
  },
  {
    "np1": "502-5819_K",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE LEVANTE DE BULLDOZER",
    "marca": "CAT",
    "modelo": "844K",
    "cilindro": {
      "diamInterior": 133.35,
      "diamSalida": 133.42,
      "diamExterior": 156.0322,
      "longBrunido": 1644.65,
      "longTotal": 1727,
      "diamOjo": null,
      "diamIntCojinete": null,
      "anchoOjo": 46
    },
    "vastago": {
      "diamVastago": 76.2,
      "longCromo": 1701.8,
      "longTotal": 1917.7,
      "diamEspiga": 44.4,
      "longEspiga": 121.67,
      "diamExtOjo": null,
      "diamIntOjo": null,
      "anchoOjo": null,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 167.767,
      "interior": 76.454,
      "sellado": 133.24,
      "longTotal": 131.699
    },
    "piston": {
      "exterior": 132.8166,
      "interior": 44.5262,
      "longitud": 70.74
    }
  },
  {
    "np1": "109-8832_844K",
    "np2": "516-8026",
    "sistema": "in",
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "marca": "CAT",
    "modelo": "844K",
    "cilindro": {
      "diamInterior": 209.55,
      "diamSalida": 209.55,
      "diamExterior": 241.3,
      "longBrunido": 355.6,
      "longTotal": 920.75,
      "diamOjo": 90.17,
      "diamIntCojinete": 57.15,
      "anchoOjo": 173.228
    },
    "vastago": {
      "diamVastago": 88.9,
      "longCromo": 501.65,
      "longTotal": 838.2,
      "diamEspiga": 69.85,
      "longEspiga": 142.875,
      "diamExtOjo": 221.0562,
      "diamIntOjo": 206.375,
      "anchoOjo": 108.077,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 323.596,
      "interior": 89.2302,
      "sellado": 126.746,
      "longTotal": 164.5158
    },
    "piston": {
      "exterior": 209.042,
      "interior": 69.8754,
      "longitud": 73.025
    }
  },
  {
    "np1": "109-8833_844K",
    "np2": "516-8027",
    "sistema": "in",
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "marca": "CAT",
    "modelo": "844K",
    "cilindro": {
      "diamInterior": 209.55,
      "diamSalida": 209.55,
      "diamExterior": 241.3,
      "longBrunido": 355.6,
      "longTotal": 920.75,
      "diamOjo": 90.17,
      "diamIntCojinete": 57.15,
      "anchoOjo": 173.228
    },
    "vastago": {
      "diamVastago": 88.9,
      "longCromo": 501.65,
      "longTotal": 838.2,
      "diamEspiga": 69.85,
      "longEspiga": 142.875,
      "diamExtOjo": 221.0562,
      "diamIntOjo": 206.375,
      "anchoOjo": 108.077,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 323.596,
      "interior": 89.2302,
      "sellado": 126.746,
      "longTotal": 164.5158
    },
    "piston": {
      "exterior": 209.042,
      "interior": 69.8754,
      "longitud": 73.025
    }
  },
  {
    "np1": "6E-1244_K",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE DIRECCION",
    "marca": "CAT",
    "modelo": "844K",
    "cilindro": {
      "diamInterior": 139.7,
      "diamSalida": 139.7,
      "diamExterior": 171.831,
      "longBrunido": 1006.475,
      "longTotal": 1168.4,
      "diamOjo": 106.172,
      "diamIntCojinete": 90.551,
      "anchoOjo": 99.441
    },
    "vastago": {
      "diamVastago": 82.55,
      "longCromo": 1003.3,
      "longTotal": 1028.7,
      "diamEspiga": 57.0992,
      "longEspiga": 152.4,
      "diamExtOjo": 166.2684,
      "diamIntOjo": 106.3498,
      "anchoOjo": 95.758,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 239.395,
      "interior": 82.9056,
      "sellado": 139.6238,
      "longTotal": 99.06
    },
    "piston": {
      "exterior": 139.2174,
      "interior": 57.2008,
      "longitud": 71.882
    }
  },
  {
    "np1": "EM0241",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE DIRECCION",
    "marca": "KOM",
    "modelo": "930E-4SE",
    "cilindro": {
      "diamInterior": 165.1,
      "diamSalida": 165.1,
      "diamExterior": 190.5,
      "longBrunido": 796.925,
      "longTotal": 996.95,
      "diamOjo": 120.65,
      "diamIntCojinete": 76.2,
      "anchoOjo": 64.008
    },
    "vastago": {
      "diamVastago": 82.55,
      "longCromo": 800.1,
      "longTotal": 1022.35,
      "diamEspiga": 44.6532,
      "longEspiga": 94.869,
      "diamExtOjo": 205.105,
      "diamIntOjo": 120.65,
      "anchoOjo": 64.008,
      "diamIntCojinete": 76.2
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 249.2248,
      "interior": 82.931,
      "sellado": 164.9984,
      "longTotal": 87.376
    },
    "piston": {
      "exterior": 163.7538,
      "interior": 44.6532,
      "longitud": 76.2
    }
  },
  {
    "np1": "EM8844",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE SUSPENSION POSTERIOR",
    "marca": "KOM",
    "modelo": "930E-4SE",
    "cilindro": {
      "diamInterior": 393.7,
      "diamSalida": 393.7,
      "diamExterior": 469.9,
      "longBrunido": 607.949,
      "longTotal": 952.5,
      "diamOjo": 222.25,
      "diamIntCojinete": null,
      "anchoOjo": 138.4808
    },
    "vastago": {
      "diamVastago": 355.6,
      "longCromo": 469.9,
      "longTotal": 939.8,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 341.376,
      "diamIntOjo": 222.25,
      "anchoOjo": 141.732,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 473.5068,
      "interior": 356.3112,
      "sellado": 393.5984,
      "longTotal": 241.3
    },
    "piston": {
      "exterior": 392.176,
      "interior": null,
      "longitud": 200.025
    }
  },
  {
    "np1": "EM8355",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE LEVANTE DE TOLVA",
    "marca": "KOM",
    "modelo": "930E-4SE",
    "cilindro": {
      "diamInterior": 355.6,
      "diamSalida": 355.6,
      "diamExterior": 406.4,
      "longBrunido": 1098.55,
      "longTotal": 1238.25,
      "diamOjo": 177.8,
      "diamIntCojinete": 101.6,
      "anchoOjo": 118.11
    },
    "vastago": {
      "diamVastago": 177.8,
      "longCromo": 1130.3,
      "longTotal": 1409.7,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 304.8,
      "diamIntOjo": 209.55,
      "anchoOjo": 101.346,
      "diamIntCojinete": 139.7
    },
    "cuerpoIntermedio": {
      "longCromo": 1022.35,
      "longBrunido": 1063.625,
      "diamIntC1": 298.45,
      "diamIntC2": 241.3,
      "diamExtC1": 330.2,
      "diamExtC2": 266.7
    },
    "tapa": {
      "exterior": 406.4,
      "interior": 330.2,
      "sellado": null,
      "longTotal": 177.8
    },
    "piston": {
      "exterior": 240.3348,
      "interior": 177.8,
      "longitud": 177.8
    }
  },
  {
    "np1": "XB3916",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE SUSPENSION DELANTERA",
    "marca": "KOM",
    "modelo": "930E-4SE",
    "cilindro": {
      "diamInterior": 431.8,
      "diamSalida": 431.9,
      "diamExterior": 523.88,
      "longBrunido": 1346.2,
      "longTotal": 1346.2,
      "diamOjo": null,
      "diamIntCojinete": null,
      "anchoOjo": null
    },
    "vastago": {
      "diamVastago": 400.05,
      "longCromo": 819.15,
      "longTotal": 1774.83,
      "diamEspiga": 380.87,
      "longEspiga": 533.4,
      "diamExtOjo": null,
      "diamIntOjo": null,
      "anchoOjo": null,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 520.7,
      "interior": 401.27,
      "sellado": 430.38,
      "longTotal": null
    },
    "piston": {
      "exterior": 430.35,
      "interior": null,
      "longitud": 317.5
    }
  },
  {
    "np1": "58B4150120SERV",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE DIRECCION",
    "marca": "KOM",
    "modelo": "980E",
    "cilindro": {
      "diamInterior": 190.5,
      "diamSalida": 195.58,
      "diamExterior": 229.362,
      "longBrunido": 771.525,
      "longTotal": 990.6,
      "diamOjo": 158.75,
      "diamIntCojinete": null,
      "anchoOjo": 100.076
    },
    "vastago": {
      "diamVastago": 95.25,
      "longCromo": 838.2,
      "longTotal": 1035.05,
      "diamEspiga": null,
      "longEspiga": 61.722,
      "diamExtOjo": 181.229,
      "diamIntOjo": 158.75,
      "anchoOjo": 151.892,
      "diamIntCojinete": 88.9
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 284.353,
      "interior": 95.631,
      "sellado": 195.5038,
      "longTotal": 201.93
    },
    "piston": {
      "exterior": 190.0174,
      "interior": 95.3262,
      "longitud": 78.486
    }
  },
  {
    "np1": "58B5001000",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE LEVANTE DE TOLVA",
    "marca": "KOM",
    "modelo": "980E",
    "cilindro": {
      "diamInterior": 384.175,
      "diamSalida": 384.175,
      "diamExterior": 434.975,
      "longBrunido": 1158.875,
      "longTotal": 1298.575,
      "diamOjo": 177.8,
      "diamIntCojinete": 114.3,
      "anchoOjo": 114.3
    },
    "vastago": {
      "diamVastago": 193.675,
      "longCromo": 1212.85,
      "longTotal": 1435.1,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 323.85,
      "diamIntOjo": 222.25,
      "anchoOjo": 136.9314,
      "diamIntCojinete": 152.4
    },
    "cuerpoIntermedio": {
      "longCromo": 1085.85,
      "longBrunido": 1123.95,
      "diamIntC1": 320.675,
      "diamIntC2": 257.175,
      "diamExtC1": 358.6988,
      "diamExtC2": 288.8488
    },
    "tapa": {
      "exterior": 488.95,
      "interior": null,
      "sellado": 383.9972,
      "longTotal": null
    },
    "piston": {
      "exterior": 254,
      "interior": 193.675,
      "longitud": 177.8
    }
  },
  {
    "np1": "58B5000400",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE SUSPENSION POSTERIOR",
    "marca": "KOM",
    "modelo": "980E-4SE",
    "cilindro": {
      "diamInterior": 412.75,
      "diamSalida": 412.75,
      "diamExterior": 492.125,
      "longBrunido": 590.55,
      "longTotal": 939.8,
      "diamOjo": 266.7,
      "diamIntCojinete": 165.1,
      "anchoOjo": 152.4
    },
    "vastago": {
      "diamVastago": 374.65,
      "longCromo": 374.142,
      "longTotal": 939.8,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 372.11,
      "diamIntOjo": 266.7,
      "anchoOjo": 149.86,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 490.22,
      "interior": 375.6152,
      "sellado": 412.6484,
      "longTotal": 256.921
    },
    "piston": {
      "exterior": 411.4292,
      "interior": null,
      "longitud": 188.6712
    }
  },
  {
    "np1": "416-4020",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE DIRECCION",
    "marca": "CAT",
    "modelo": "994K",
    "cilindro": {
      "diamInterior": 196.85,
      "diamSalida": 196.85,
      "diamExterior": 249.6312,
      "longBrunido": 1324.991,
      "longTotal": 1593.215,
      "diamOjo": 168.021,
      "diamIntCojinete": 101.6,
      "anchoOjo": 149.8854
    },
    "vastago": {
      "diamVastago": 107.95,
      "longCromo": 1314.45,
      "longTotal": 1661.9982,
      "diamEspiga": 82.55,
      "longEspiga": 180.0352,
      "diamExtOjo": 82.55,
      "diamIntOjo": 168.275,
      "anchoOjo": 101.6,
      "diamIntCojinete": 101.6
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 324.993,
      "interior": 108.331,
      "sellado": 196.723,
      "longTotal": 132.715
    },
    "piston": {
      "exterior": 196.3166,
      "interior": 82.55,
      "longitud": 132.715
    }
  },
  {
    "np1": "465-2717",
    "np2": null,
    "sistema": "mm",
    "descripcion": "CILINDRO DE LEVANTE DE BULLDOZER",
    "marca": "CAT",
    "modelo": "D11",
    "cilindro": {
      "diamInterior": 170,
      "diamSalida": 170,
      "diamExterior": 204,
      "longBrunido": 1882,
      "longTotal": 1995,
      "diamOjo": null,
      "diamIntCojinete": null,
      "anchoOjo": 63
    },
    "vastago": {
      "diamVastago": 105,
      "longCromo": 197.5,
      "longTotal": 291.35,
      "diamEspiga": 69.7,
      "longEspiga": 163,
      "diamExtOjo": 148.85,
      "diamIntOjo": 63.6,
      "anchoOjo": 76,
      "diamIntCojinete": 57.75
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 279.5,
      "interior": 105.6,
      "sellado": 169.9,
      "longTotal": 195
    },
    "piston": {
      "exterior": 162.9,
      "interior": 69.9,
      "longitud": 89.06
    }
  },
  {
    "np1": "561-7470",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE LEVANTE DE RIPPER",
    "marca": "CAT",
    "modelo": "D11",
    "cilindro": {
      "diamInterior": 234.95,
      "diamSalida": 234.95,
      "diamExterior": 280.3652,
      "longBrunido": 746.9886,
      "longTotal": 990.6,
      "diamOjo": 101.6,
      "diamIntCojinete": 88.9,
      "anchoOjo": 76.6826
    },
    "vastago": {
      "diamVastago": 95.25,
      "longCromo": 603.25,
      "longTotal": 1052.7792,
      "diamEspiga": 71.882,
      "longEspiga": 165.1,
      "diamExtOjo": 180.34,
      "diamIntOjo": 101.6,
      "anchoOjo": 101.6,
      "diamIntCojinete": 88.9
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 358.14,
      "interior": 95.6056,
      "sellado": 234.8992,
      "longTotal": 140.6652
    },
    "piston": {
      "exterior": 234.0356,
      "interior": 72.1868,
      "longitud": 97.155
    }
  },
  {
    "np1": "252-0471",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE LEVANTE DE BULLDOZER",
    "marca": "CAT",
    "modelo": "D11T",
    "cilindro": {
      "diamInterior": 177.8,
      "diamSalida": 177.93,
      "diamExterior": 219.075,
      "longBrunido": 1885.95,
      "longTotal": 1993.9,
      "diamOjo": null,
      "diamIntCojinete": null,
      "anchoOjo": 63
    },
    "vastago": {
      "diamVastago": 101.6,
      "longCromo": 1936.75,
      "longTotal": 1936.75,
      "diamEspiga": 69.8,
      "longEspiga": 162.56,
      "diamExtOjo": 150.72,
      "diamIntOjo": 168.275,
      "anchoOjo": 76.2,
      "diamIntCojinete": 58.12
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 309.5498,
      "interior": 102.0826,
      "sellado": 6.996,
      "longTotal": 182.6768
    },
    "piston": {
      "exterior": 177.292,
      "interior": 69.85,
      "longitud": 88.95
    }
  },
  {
    "np1": "521-8423",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE LEVANTE DE RIPPER",
    "marca": "CAT",
    "modelo": "D11T",
    "cilindro": {
      "diamInterior": 254,
      "diamSalida": 254,
      "diamExterior": 298.7,
      "longBrunido": 717.55,
      "longTotal": 990.6,
      "diamOjo": 101.6,
      "diamIntCojinete": 89.4,
      "anchoOjo": 101.6
    },
    "vastago": {
      "diamVastago": 88.9,
      "longCromo": 762,
      "longTotal": 1073.15,
      "diamEspiga": null,
      "longEspiga": 190.5,
      "diamExtOjo": 209.9,
      "diamIntOjo": 101.6,
      "anchoOjo": 101.6,
      "diamIntCojinete": 89.23
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 359.918,
      "interior": 89.281,
      "sellado": 253.873,
      "longTotal": 140.2588
    },
    "piston": {
      "exterior": 253.466,
      "interior": null,
      "longitud": 113.03
    }
  },
  {
    "np1": "367-2258",
    "np2": "517-3766",
    "sistema": "in",
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "marca": "CAT",
    "modelo": "D11T",
    "cilindro": {
      "diamInterior": 266.7,
      "diamSalida": 266.7,
      "diamExterior": 311.15,
      "longBrunido": 463.55,
      "longTotal": 1727.2,
      "diamOjo": 158.75,
      "diamIntCojinete": 101.6,
      "anchoOjo": 93.345
    },
    "vastago": {
      "diamVastago": 101.6,
      "longCromo": 488.95,
      "longTotal": 920.75,
      "diamEspiga": null,
      "longEspiga": 209.55,
      "diamExtOjo": 265.43,
      "diamIntOjo": 158.75,
      "anchoOjo": 108.077,
      "diamIntCojinete": 101.6
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 375.666,
      "interior": 104.902,
      "sellado": 266.5476,
      "longTotal": 141.224
    },
    "piston": {
      "exterior": 265.684,
      "interior": null,
      "longitud": 113.03
    }
  },
  {
    "np1": "517-3767",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "marca": "CAT",
    "modelo": "D11T",
    "cilindro": {
      "diamInterior": 266.7,
      "diamSalida": 266.7,
      "diamExterior": 311.15,
      "longBrunido": 463.55,
      "longTotal": 1727.2,
      "diamOjo": 158.75,
      "diamIntCojinete": 101.6,
      "anchoOjo": 93.345
    },
    "vastago": {
      "diamVastago": 101.6,
      "longCromo": 488.95,
      "longTotal": 920.75,
      "diamEspiga": null,
      "longEspiga": 209.55,
      "diamExtOjo": 265.43,
      "diamIntOjo": 158.75,
      "anchoOjo": 108.077,
      "diamIntCojinete": 101.6
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 375.666,
      "interior": 104.902,
      "sellado": 266.5476,
      "longTotal": 141.224
    },
    "piston": {
      "exterior": 265.684,
      "interior": null,
      "longitud": 113.03
    }
  },
  {
    "np1": "521-8420",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE INCLINACION DE RIPPER",
    "marca": "CAT",
    "modelo": "D11T",
    "cilindro": {
      "diamInterior": 196.85,
      "diamSalida": 196.85,
      "diamExterior": 241.3,
      "longBrunido": 996.95,
      "longTotal": 1447.8,
      "diamOjo": 101.6,
      "diamIntCojinete": 88.9,
      "anchoOjo": 101.346
    },
    "vastago": {
      "diamVastago": 95.25,
      "longCromo": 990.6,
      "longTotal": 1282.7,
      "diamEspiga": 69.85,
      "longEspiga": 165.1,
      "diamExtOjo": 178.1048,
      "diamIntOjo": 101.6,
      "anchoOjo": 100.8888,
      "diamIntCojinete": 88.9
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 302.9712,
      "interior": 95.6056,
      "sellado": 196.7484,
      "longTotal": 139.7
    },
    "piston": {
      "exterior": 196.342,
      "interior": 69.9008,
      "longitud": 89.9668
    }
  },
  {
    "np1": "707G300180SG",
    "np2": null,
    "sistema": "mm",
    "descripcion": "CILINDRO DE LEVANTE DE BULLDOZER",
    "marca": "KOM",
    "modelo": "D475",
    "cilindro": {
      "diamInterior": 180,
      "diamSalida": 182.05,
      "diamExterior": 213,
      "longBrunido": 2073,
      "longTotal": 2200,
      "diamOjo": null,
      "diamIntCojinete": null,
      "anchoOjo": null
    },
    "vastago": {
      "diamVastago": 110,
      "longCromo": 2140,
      "longTotal": 2470,
      "diamEspiga": 90,
      "longEspiga": 172,
      "diamExtOjo": 161.25,
      "diamIntOjo": 80.05,
      "anchoOjo": 90,
      "diamIntCojinete": 65.4
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 244.56,
      "interior": 110.97,
      "sellado": 181.96,
      "longTotal": 113.63
    },
    "piston": {
      "exterior": 178.9,
      "interior": 90,
      "longitud": 92
    }
  },
  {
    "np1": "707H106340SG",
    "np2": null,
    "sistema": "mm",
    "descripcion": "CILINDRO DE LEVANTE DE RIPPER",
    "marca": "KOM",
    "modelo": "D475",
    "cilindro": {
      "diamInterior": 225,
      "diamSalida": 230,
      "diamExterior": 267,
      "longBrunido": 735,
      "longTotal": 1050,
      "diamOjo": 125,
      "diamIntCojinete": 111.35,
      "anchoOjo": 140
    },
    "vastago": {
      "diamVastago": 120,
      "longCromo": 890,
      "longTotal": 1225.5,
      "diamEspiga": 119,
      "longEspiga": 101.25,
      "diamExtOjo": 224.05,
      "diamIntOjo": 125.1,
      "anchoOjo": 125,
      "diamIntCojinete": 110.25
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 307.5,
      "interior": 120.62,
      "sellado": 229.92,
      "longTotal": 130.1
    },
    "piston": {
      "exterior": 223.86,
      "interior": 118.96,
      "longitud": 95.09
    }
  },
  {
    "np1": "7070-10-F521",
    "np2": null,
    "sistema": "mm",
    "descripcion": "CILINDRO DE INCLINACION DE BULLDOZER",
    "marca": "KOM",
    "modelo": "D475",
    "cilindro": {
      "diamInterior": 250,
      "diamSalida": 252.1,
      "diamExterior": 300,
      "longBrunido": 502,
      "longTotal": 1295,
      "diamOjo": 125,
      "diamIntCojinete": 92.5,
      "anchoOjo": 115
    },
    "vastago": {
      "diamVastago": 140,
      "longCromo": 500,
      "longTotal": 910,
      "diamEspiga": 119.8,
      "longEspiga": 185,
      "diamExtOjo": 259,
      "diamIntOjo": 185,
      "anchoOjo": 115.5,
      "diamIntCojinete": 90.1
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 350.2,
      "interior": 141,
      "sellado": 251.95,
      "longTotal": 141
    },
    "piston": {
      "exterior": 248.9,
      "interior": 120.1,
      "longitud": 97
    }
  },
  {
    "np1": "250-5861",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE LEVANTE DE BULLDOZER",
    "marca": "CAT",
    "modelo": "D8",
    "cilindro": {
      "diamInterior": 114.3,
      "diamSalida": 119.38,
      "diamExterior": 139.7,
      "longBrunido": 1581.15,
      "longTotal": 1670.05,
      "diamOjo": null,
      "diamIntCojinete": 63.5,
      "anchoOjo": null
    },
    "vastago": {
      "diamVastago": 76.2,
      "longCromo": 1555.75,
      "longTotal": 1657.35,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 187.7314,
      "diamIntOjo": null,
      "anchoOjo": 104.3686,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 148.463,
      "interior": 76.962,
      "sellado": 119.9896,
      "longTotal": 98.044
    },
    "piston": {
      "exterior": 113.411,
      "interior": 76.2,
      "longitud": 75.9968
    }
  },
  {
    "np1": "707010F502",
    "np2": null,
    "sistema": "mm",
    "descripcion": "CILINDRO DE DIRECCION",
    "marca": "KOM",
    "modelo": "HD1500",
    "cilindro": {
      "diamInterior": 140,
      "diamSalida": 141,
      "diamExterior": 158.4,
      "longBrunido": 665,
      "longTotal": 865,
      "diamOjo": 135,
      "diamIntCojinete": null,
      "anchoOjo": 90
    },
    "vastago": {
      "diamVastago": 75,
      "longCromo": 925,
      "longTotal": 1160,
      "diamEspiga": null,
      "longEspiga": 50,
      "diamExtOjo": 200.16,
      "diamIntOjo": 135,
      "anchoOjo": 90,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 192.65,
      "interior": 75.6,
      "sellado": 141.9,
      "longTotal": 88.15
    },
    "piston": {
      "exterior": 138.9,
      "interior": null,
      "longitud": 67.58
    }
  },
  {
    "np1": "R4290004",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE LETOURNEAU",
    "marca": "P&H",
    "modelo": "LT2350",
    "cilindro": {
      "diamInterior": 241.3,
      "diamSalida": 241.3,
      "diamExterior": 304.8,
      "longBrunido": 914.4,
      "longTotal": 1117.6,
      "diamOjo": 158.75,
      "diamIntCojinete": 101.6,
      "anchoOjo": 101.219
    },
    "vastago": {
      "diamVastago": 114.3,
      "longCromo": 946.15,
      "longTotal": 1382.776,
      "diamEspiga": null,
      "longEspiga": null,
      "diamExtOjo": 311.15,
      "diamIntOjo": 158.496,
      "anchoOjo": 101.346,
      "diamIntCojinete": 101.6
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 311.15,
      "interior": 114.4016,
      "sellado": 244.1448,
      "longTotal": 142.24
    },
    "piston": {
      "exterior": 240.6142,
      "interior": 114.4016,
      "longitud": 109.22
    }
  },
  {
    "np1": "507-2616",
    "np2": null,
    "sistema": "in",
    "descripcion": "CILINDRO DE LEVANTE DE MASTIL",
    "marca": "CAT",
    "modelo": "MD6540",
    "cilindro": {
      "diamInterior": 228.1936,
      "diamSalida": 228.1936,
      "diamExterior": 253.746,
      "longBrunido": 2809.875,
      "longTotal": 2971.8,
      "diamOjo": 76.6064,
      "diamIntCojinete": null,
      "anchoOjo": 38.1
    },
    "vastago": {
      "diamVastago": 127,
      "longCromo": 2752.725,
      "longTotal": 3013.075,
      "diamEspiga": null,
      "longEspiga": 117.475,
      "diamExtOjo": 152.4,
      "diamIntOjo": 76.708,
      "anchoOjo": 38.1,
      "diamIntCojinete": null
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 234.95,
      "interior": 127.4826,
      "sellado": 228.3206,
      "longTotal": 114.3
    },
    "piston": {
      "exterior": 228.1428,
      "interior": 127,
      "longitud": 82.55
    }
  },
  {
    "np1": "707G105230",
    "np2": null,
    "sistema": "mm",
    "descripcion": "CILINDRO DE VOLTEO DE BUCKET",
    "marca": "KOM",
    "modelo": "PC1250",
    "cilindro": {
      "diamInterior": 160,
      "diamSalida": 161,
      "diamExterior": 190,
      "longBrunido": 2220,
      "longTotal": 2390,
      "diamOjo": 115,
      "diamIntCojinete": 100.5,
      "anchoOjo": 116.45
    },
    "vastago": {
      "diamVastago": 115,
      "longCromo": 1135,
      "longTotal": 2390,
      "diamEspiga": 211,
      "longEspiga": 203,
      "diamExtOjo": 178.5,
      "diamIntOjo": 115,
      "anchoOjo": 116.45,
      "diamIntCojinete": 101
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 225.1,
      "interior": 115.65,
      "sellado": 160.95,
      "longTotal": null
    },
    "piston": {
      "exterior": 158.9,
      "interior": 105.05,
      "longitud": 123
    }
  },
  {
    "np1": "707-F1-01380",
    "np2": null,
    "sistema": "mm",
    "descripcion": "CILINDRO DE BOOM",
    "marca": "KOM",
    "modelo": "PC1250",
    "cilindro": {
      "diamInterior": 225,
      "diamSalida": 230.05,
      "diamExterior": 263.7,
      "longBrunido": 2520,
      "longTotal": 3020,
      "diamOjo": null,
      "diamIntCojinete": 140,
      "anchoOjo": 107.5
    },
    "vastago": {
      "diamVastago": 160,
      "longCromo": 2670,
      "longTotal": 3135,
      "diamEspiga": 150,
      "longEspiga": 203,
      "diamExtOjo": 358,
      "diamIntOjo": null,
      "anchoOjo": 110.5,
      "diamIntCojinete": 140
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 330,
      "interior": 160.64,
      "sellado": 229.96,
      "longTotal": 175.8
    },
    "piston": {
      "exterior": 223.93,
      "interior": 150.03,
      "longitud": 111
    }
  },
  {
    "np1": "707G105170",
    "np2": null,
    "sistema": "mm",
    "descripcion": "CILINDRO DE VOLTEO DE STICK",
    "marca": "KOM",
    "modelo": "PC1250",
    "cilindro": {
      "diamInterior": 225,
      "diamSalida": 230.03,
      "diamExterior": 263.9,
      "longBrunido": 2520,
      "longTotal": 3020,
      "diamOjo": 235,
      "diamIntCojinete": 140,
      "anchoOjo": 106.5
    },
    "vastago": {
      "diamVastago": 160,
      "longCromo": 2670,
      "longTotal": 3135,
      "diamEspiga": 150,
      "longEspiga": 203,
      "diamExtOjo": 358,
      "diamIntOjo": 235,
      "anchoOjo": 110.5,
      "diamIntCojinete": 140
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 330,
      "interior": 160.63,
      "sellado": 229.96,
      "longTotal": 175.83
    },
    "piston": {
      "exterior": 223.9,
      "interior": 150.02,
      "longitud": 111.3
    }
  },
  {
    "np1": "707-H10-5800",
    "np2": null,
    "sistema": "mm",
    "descripcion": "CILINDRO DE BUCKET",
    "marca": "KOM",
    "modelo": "PC2000",
    "cilindro": {
      "diamInterior": 200,
      "diamSalida": 201.05,
      "diamExterior": 235,
      "longBrunido": 2500,
      "longTotal": 2720,
      "diamOjo": 135.15,
      "diamIntCojinete": 120.18,
      "anchoOjo": 146
    },
    "vastago": {
      "diamVastago": 140,
      "longCromo": 2620,
      "longTotal": 3035,
      "diamEspiga": 129.9,
      "longEspiga": 240,
      "diamExtOjo": 235,
      "diamIntOjo": 160,
      "anchoOjo": 146,
      "diamIntCojinete": 140
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 290.2,
      "interior": 140.8,
      "sellado": 200.92,
      "longTotal": 189.5
    },
    "piston": {
      "exterior": 189.9,
      "interior": 130.1,
      "longitud": 158.2
    }
  },
  {
    "np1": "707010K761",
    "np2": null,
    "sistema": "mm",
    "descripcion": "CILINDRO DE BOOM",
    "marca": "KOM",
    "modelo": "PC2000",
    "cilindro": {
      "diamInterior": 300,
      "diamSalida": 310,
      "diamExterior": 365,
      "longBrunido": 2975,
      "longTotal": 3340,
      "diamOjo": null,
      "diamIntCojinete": 180,
      "anchoOjo": 130
    },
    "vastago": {
      "diamVastago": 200,
      "longCromo": 2925,
      "longTotal": 3480,
      "diamEspiga": 184.9,
      "longEspiga": 235,
      "diamExtOjo": 420,
      "diamIntOjo": null,
      "anchoOjo": 130,
      "diamIntCojinete": 180
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 430,
      "interior": 200.5,
      "sellado": 309.9,
      "longTotal": 230
    },
    "piston": {
      "exterior": 298.95,
      "interior": 185.03,
      "longitud": 131
    }
  },
  {
    "np1": "707H105780",
    "np2": null,
    "sistema": "mm",
    "descripcion": "CILINDRO DE STICK",
    "marca": "KOM",
    "modelo": "PC2000",
    "cilindro": {
      "diamInterior": 200,
      "diamSalida": 201,
      "diamExterior": null,
      "longBrunido": 2500,
      "longTotal": 2720,
      "diamOjo": 130,
      "diamIntCojinete": 120,
      "anchoOjo": 146
    },
    "vastago": {
      "diamVastago": 140,
      "longCromo": 2622,
      "longTotal": 3037,
      "diamEspiga": 129.9,
      "longEspiga": 237,
      "diamExtOjo": 232,
      "diamIntOjo": 160,
      "anchoOjo": null,
      "diamIntCojinete": 140
    },
    "cuerpoIntermedio": {
      "longCromo": null,
      "longBrunido": null,
      "diamIntC1": null,
      "diamIntC2": null,
      "diamExtC1": null,
      "diamExtC2": null
    },
    "tapa": {
      "exterior": 290.3,
      "interior": 140.93,
      "sellado": 200.95,
      "longTotal": 166.8
    },
    "piston": {
      "exterior": 198.85,
      "interior": 130.02,
      "longitud": 156.7
    }
  }
];
