import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface LibraryDocument {
  id: string;
  name: string;
  category: string;
  fileType: string;
  version: string;
  uploadedAt: string;
  description?: string;
}

const SAMPLE_DOCS: LibraryDocument[] = [
  { id: "1", name: "US Navy Diving Manual Rev 7", category: "Standards", fileType: "PDF", version: "7.0", uploadedAt: "2024-01-15" },
  { id: "2", name: "OSHA Commercial Diving Operations", category: "Regulations", fileType: "PDF", version: "1926.1071", uploadedAt: "2024-02-01" },
  { id: "3", name: "Decompression Tables - Air", category: "Tables", fileType: "PDF", version: "2024", uploadedAt: "2024-01-01" },
  { id: "4", name: "Emergency Procedures Guide", category: "SOPs", fileType: "PDF", version: "3.2", uploadedAt: "2024-03-01" },
  { id: "5", name: "Equipment Maintenance Log Template", category: "Templates", fileType: "XLSX", version: "1.0", uploadedAt: "2024-02-15" },
];

export function LibraryTab() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: docs = SAMPLE_DOCS } = useQuery<LibraryDocument[]>({
    queryKey: ["library-docs"],
    queryFn: async () => {
      const res = await fetch("/api/library", { credentials: "include" });
      if (!res.ok) return SAMPLE_DOCS;
      const data = await res.json();
      return data.length > 0 ? data : SAMPLE_DOCS;
    },
  });

  const categories = [...new Set(docs.map(d => d.category))];

  const filteredDocs = docs.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(search.toLowerCase()) ||
      doc.description?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Standards": return "bg-blue-600";
      case "Regulations": return "bg-purple-600";
      case "Tables": return "bg-green-600";
      case "SOPs": return "bg-orange-600";
      case "Templates": return "bg-teal-600";
      default: return "bg-gray-600";
    }
  };

  return (
    <div className="h-full p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Document Library</h2>
        <p className="text-sm text-navy-400">
          Reference documents, standards, and templates
        </p>
      </div>

      <div className="flex gap-4 mb-4">
        <Input
          data-testid="input-library-search"
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-navy-900 border-navy-600 text-white max-w-sm"
        />
        <div className="flex gap-2">
          <Badge
            data-testid="filter-all"
            className={`cursor-pointer ${!selectedCategory ? "bg-blue-600" : "bg-navy-700 hover:bg-navy-600"}`}
            onClick={() => setSelectedCategory(null)}
          >
            All
          </Badge>
          {categories.map(cat => (
            <Badge
              key={cat}
              data-testid={`filter-${cat.toLowerCase()}`}
              className={`cursor-pointer ${selectedCategory === cat ? getCategoryColor(cat) : "bg-navy-700 hover:bg-navy-600"}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-220px)]">
        <div className="grid gap-3">
          {filteredDocs.map((doc) => (
            <Card
              key={doc.id}
              data-testid={`doc-card-${doc.id}`}
              className="bg-navy-800/50 border-navy-600 hover:bg-navy-800/70 transition-colors cursor-pointer"
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-navy-700 flex items-center justify-center text-xs font-mono text-navy-300">
                      {doc.fileType}
                    </div>
                    <div>
                      <h3 className="text-white font-medium">{doc.name}</h3>
                      <p className="text-sm text-navy-400">
                        Version {doc.version} • Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Badge className={getCategoryColor(doc.category)}>
                    {doc.category}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredDocs.length === 0 && (
            <div className="text-center py-12">
              <p className="text-navy-400">No documents found</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
