import { useLocalSearchParams } from "expo-router";
import React from "react";

import { ProductForm } from "@/components/ProductForm";

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductForm productId={Number(id)} />;
}
