import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap { const base="https://savvytechautomations.com"; return [{url:base,lastModified:new Date(),priority:1},{url:`${base}/privacy`,lastModified:new Date(),priority:.2},{url:`${base}/terms`,lastModified:new Date(),priority:.2}]; }
