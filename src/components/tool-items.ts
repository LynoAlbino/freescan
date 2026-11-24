import {
  Images,
  Combine,
  Scissors,
  Minimize2,
  Files,
  ArrowDownUp,
  RotateCw,
} from "lucide-react";
export const TOOL_ITEMS = [
  {
    id: "images",
    name: "Image to PDF",
    description: "Give your photos a new format.",
    icon: Images,
  },
  {
    id: "merge",
    name: "Merge PDFs",
    description: "Bring your documents together.",
    icon: Combine,
  },
  {
    id: "split",
    name: "Split PDF",
    description: "One document, separate files.",
    icon: Scissors,
  },
  {
    id: "compress",
    name: "Compress PDF",
    description: "Less space. Same essentials.",
    icon: Minimize2,
  },
  {
    id: "extract",
    name: "Extract pages",
    description: "Keep just the pages you need.",
    icon: Files,
  },
  {
    id: "reorder",
    name: "Reorder pages",
    description: "Put everything in its place.",
    icon: ArrowDownUp,
  },
  {
    id: "rotate",
    name: "Rotate PDF",
    description: "A fresh perspective on your pages.",
    icon: RotateCw,
  },
];
