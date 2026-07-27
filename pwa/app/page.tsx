import type { Metadata } from "next";
import EsipApp from "./EsipApp";

export const metadata: Metadata = {
  title: "ESIP Enterprise Intelligence",
  description: "Sales intelligence, data health and governed Admin confirmations.",
};

export default function Home() {
  return <EsipApp />;
}
