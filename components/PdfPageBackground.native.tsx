import React from "react";
import Pdf from "react-native-pdf";

type Props = {
  uri: string;
  pageNumber: number;
  width: number;
  height: number;
};

export default function PdfPageBackground({
  uri,
  pageNumber,
  width,
  height,
}: Props) {
  return (
    <Pdf
      source={{ uri, cache: true }}
      page={pageNumber}
      enablePaging={false}
      singlePage
      trustAllCerts={false}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width,
        height,
        zIndex: 0,
      }}
    />
  );
}
