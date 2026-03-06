import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { useProject } from "@/hooks/use-project";
import { Download, FileText, FileSpreadsheet, FolderOpen, Archive, Eye, EyeOff, X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface LibraryDocument {
  id: string;
  name: string;
  category: string;
  fileType: string;
  version: string;
  uploadedAt: string;
  description?: string;
}

interface LibraryExport {
  id: string;
  projectId: string;
  dayId: string;
  fileName: string;
  filePath: string;
  fileType: string;
  docCategory: string;
  exportedAt: string;
  exportedBy: string;
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
  const [activeTab, setActiveTab] = useState("exports");
  const [showArchived, setShowArchived] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [selectedRefDoc, setSelectedRefDoc] = useState<LibraryDocument | null>(null);
  const [refDocUrl, setRefDocUrl] = useState<string | null>(null);
  const [refDocLoading, setRefDocLoading] = useState(false);
  const { activeProject } = useProject();
  const { toast } = useToast();

  // Fetch reference documents from Azure Blob Storage
  const { data: blobDocs = [] } = useQuery<Array<{ name: string; contentLength: number; lastModified: string; contentType: string }>>({
    queryKey: ["reference-docs"],
    queryFn: async () => {
      const res = await fetch("/api/reference-docs/list", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Open a reference doc via SAS URL
  const openRefDoc = async (blobName: string) => {
    setRefDocLoading(true);
    try {
      const res = await fetch(`/api/reference-docs/sas-url?blobName=${encodeURIComponent(blobName)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to get document URL");
      const { url } = await res.json();
      setRefDocUrl(url);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to open document", variant: "destructive" });
    } finally {
      setRefDocLoading(false);
    }
  };

  const { data: previewData, error: previewError, isLoading: previewLoading } = useQuery<{ content: string; lines: string[]; fileName: string; fileType: string }>({
    queryKey: ["library-preview", previewId],
    queryFn: async () => {
      const res = await fetch(`/api/library-exports/${previewId}/preview`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load preview");
      return res.json();
    },
    enabled: !!previewId,
  });

  const archiveKey = `diveops_archived_exports_${activeProject?.id || "default"}`;

  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(archiveKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const toggleArchive = (id: string) => {
    setArchivedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem(archiveKey, JSON.stringify([...next]));
      return next;
    });
  };

  const archiveGroup = (ids: string[]) => {
    setArchivedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      localStorage.setItem(archiveKey, JSON.stringify([...next]));
      return next;
    });
    toast({ title: "Archived", description: `${ids.length} document(s) archived` });
  };

  const { data: docs = SAMPLE_DOCS } = useQuery<LibraryDocument[]>({
    queryKey: ["library-docs"],
    queryFn: async () => {
      const res = await fetch("/api/library", { credentials: "include" });
      if (!res.ok) return SAMPLE_DOCS;
      const data = await res.json();
      return data.length > 0 ? data : SAMPLE_DOCS;
    },
  });

  const { data: exports = [] } = useQuery<LibraryExport[]>({
    queryKey: ["library-exports", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      const res = await fetch(`/api/projects/${activeProject.id}/library-exports`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeProject?.id,
  });

  const categories = Array.from(new Set(docs.map(d => d.category)));

  const filteredDocs = docs.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(search.toLowerCase()) ||
      doc.description?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const activeExports = exports.filter(exp => !archivedIds.has(exp.id));
  const archivedExports = exports.filter(exp => archivedIds.has(exp.id));
  const displayExports = showArchived ? archivedExports : activeExports;

  const filteredExports = displayExports.filter(exp => 
    exp.fileName.toLowerCase().includes(search.toLowerCase()) ||
    exp.filePath.toLowerCase().includes(search.toLowerCase())
  );

  const groupedExports = filteredExports.reduce((acc, exp) => {
    const date = exp.filePath.split("/")[1] || "Other";
    if (!acc[date]) acc[date] = [];
    acc[date].push(exp);
    return acc;
  }, {} as Record<string, LibraryExport[]>);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Standards": return "btn-gold-metallic";
      case "Regulations": return "bg-purple-600";
      case "Tables": return "bg-green-600";
      case "SOPs": return "bg-orange-600";
      case "Templates": return "bg-teal-600";
      default: return "bg-gray-600";
    }
  };

  const getDocCategoryLabel = (cat: string) => {
    switch (cat) {
      case "raw_notes": return "Raw Notes";
      case "daily_log": return "Daily Log";
      case "master_log": return "Master Log";
      case "dive_log": return "Dive Log";
      case "risk_register": return "Risk Register";
      default: return cat;
    }
  };

  const getDocCategoryColor = (cat: string) => {
    switch (cat) {
      case "raw_notes": return "bg-gray-600";
      case "daily_log": return "btn-gold-metallic";
      case "master_log": return "bg-green-600";
      case "dive_log": return "bg-cyan-600";
      case "risk_register": return "bg-red-600";
      default: return "bg-navy-600";
    }
  };

  const handleDownload = (id: string, fileName: string) => {
    window.open(`/api/library-exports/${id}/download`, "_blank");
  };

  const handlePreview = (id: string) => {
    setPreviewId(id);
  };

  return (
    <div className="h-full p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Document Library</h2>
        <p className="text-sm text-navy-400">
          {activeProject?.name || "Select a project"} - Exported documents and reference materials
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-navy-800 border-navy-600 mb-4">
          <TabsTrigger 
            value="exports" 
            data-testid="tab-exports"
            className="data-[state=active]:bg-navy-600 text-white"
          >
            Shift Exports ({activeExports.length})
          </TabsTrigger>
          <TabsTrigger 
            value="reference" 
            data-testid="tab-reference"
            className="data-[state=active]:bg-navy-600 text-white"
          >
            Reference Docs ({docs.length})
          </TabsTrigger>
        </TabsList>

        <div className="flex gap-4 mb-4">
          <Input
            data-testid="input-library-search"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-navy-900 border-navy-600 text-white max-w-sm"
          />
          {activeTab === "reference" && (
            <div className="flex gap-2 flex-wrap">
              <Badge
                data-testid="filter-all"
                className={`cursor-pointer ${!selectedCategory ? "btn-gold-metallic" : "bg-navy-700 hover:bg-navy-600"}`}
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
          )}
        </div>

        <TabsContent value="exports" className="mt-0">
          <div className="flex items-center gap-2 mb-3">
            <Button
              size="sm"
              variant={showArchived ? "default" : "outline"}
              data-testid="toggle-archived"
              onClick={() => setShowArchived(!showArchived)}
              className={showArchived ? "bg-amber-600 hover:bg-amber-500 text-black" : "border-navy-600 text-navy-300 hover:text-white"}
            >
              {showArchived ? <Eye className="w-3 h-3 mr-1" /> : <Archive className="w-3 h-3 mr-1" />}
              {showArchived ? `Archived (${archivedExports.length})` : `View Archived (${archivedExports.length})`}
            </Button>
            {showArchived && archivedExports.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                data-testid="unarchive-all"
                onClick={() => {
                  setArchivedIds(new Set());
                  localStorage.removeItem(archiveKey);
                  toast({ title: "Restored", description: "All documents restored from archive" });
                }}
                className="border-navy-600 text-navy-300 hover:text-white"
              >
                Restore All
              </Button>
            )}
          </div>
          <ScrollArea className="h-[calc(100vh-320px)]">
            {Object.keys(groupedExports).length === 0 ? (
              <div className="text-center py-12">
                <FolderOpen className="w-12 h-12 text-navy-500 mx-auto mb-4" />
                <p className="text-navy-400">No exported documents yet</p>
                <p className="text-sm text-navy-500 mt-2">
                  Use "Close & Export to Library" when closing a shift to generate documents
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedExports)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([date, exps]) => (
                    <div key={date}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-white font-medium flex items-center gap-2">
                          <FolderOpen className="w-4 h-4 text-amber-500" />
                          {date}
                        </h3>
                        {!showArchived && (
                          <Button
                            size="sm"
                            variant="ghost"
                            data-testid={`archive-group-${date}`}
                            onClick={() => archiveGroup(exps.map(e => e.id))}
                            className="text-navy-400 hover:text-amber-400 text-xs h-6"
                          >
                            <Archive className="w-3 h-3 mr-1" />
                            Archive All
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-2 pl-6">
                        {exps.map(exp => (
                          <Card
                            key={exp.id}
                            data-testid={`export-card-${exp.id}`}
                            className="bg-navy-800/50 border-navy-600 hover:bg-navy-800/70 transition-colors"
                          >
                            <CardContent className="py-3 px-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {exp.fileType === "docx" ? (
                                    <FileText className="w-8 h-8 text-amber-400" />
                                  ) : (
                                    <FileSpreadsheet className="w-8 h-8 text-green-400" />
                                  )}
                                  <div>
                                    <h4 className="text-white font-medium text-sm">{exp.fileName}</h4>
                                    <p className="text-xs text-navy-400">
                                      {format(new Date(exp.exportedAt), "MMM d, yyyy h:mm a")}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge className={getDocCategoryColor(exp.docCategory)}>
                                    {getDocCategoryLabel(exp.docCategory)}
                                  </Badge>
                                  {exp.fileType === "docx" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      data-testid={`preview-${exp.id}`}
                                      onClick={() => handlePreview(exp.id)}
                                      className="border-navy-600 text-white hover:bg-navy-600"
                                      title="Preview"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    data-testid={`download-${exp.id}`}
                                    onClick={() => handleDownload(exp.id, exp.fileName)}
                                    className="border-navy-600 text-white hover:bg-navy-600"
                                  >
                                    <Download className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    data-testid={`archive-${exp.id}`}
                                    onClick={() => toggleArchive(exp.id)}
                                    className="text-navy-400 hover:text-amber-400"
                                    title={archivedIds.has(exp.id) ? "Restore" : "Archive"}
                                  >
                                    <Archive className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="reference" className="mt-0">
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="grid gap-3">
              {filteredDocs.map((doc) => (
                <Card
                  key={doc.id}
                  data-testid={`doc-card-${doc.id}`}
                  className="bg-navy-800/50 border-navy-600 hover:bg-navy-800/70 transition-colors cursor-pointer"
                  onClick={() => setSelectedRefDoc(doc)}
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
                          {doc.description && (
                            <p className="text-xs text-navy-500 mt-0.5">{doc.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getCategoryColor(doc.category)}>
                          {doc.category}
                        </Badge>
                        <Button size="sm" variant="outline" className="border-navy-600 text-white hover:bg-navy-600" title="View Document">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {filteredDocs.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-navy-400">No documents found</p>
                </div>
              )}

              {/* Azure Blob Storage Documents */}
              {blobDocs.length > 0 && (
                <>
                  <div className="mt-6 mb-2">
                    <h3 className="text-amber-400 font-semibold text-sm">Cloud Storage Documents</h3>
                    <p className="text-navy-400 text-xs">Documents from Azure Blob Storage</p>
                  </div>
                  {blobDocs.map((blob, idx) => (
                    <Card
                      key={`blob-${idx}`}
                      className="bg-navy-800/50 border-navy-600 hover:bg-navy-800/70 transition-colors cursor-pointer"
                      onClick={() => openRefDoc(blob.name)}
                    >
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded bg-navy-700 flex items-center justify-center text-xs font-mono text-navy-300">
                              {blob.contentType?.includes("pdf") ? "PDF" : blob.name.split(".").pop()?.toUpperCase() || "DOC"}
                            </div>
                            <div>
                              <h3 className="text-white font-medium">{blob.name}</h3>
                              <p className="text-sm text-navy-400">
                                {(blob.contentLength / 1024 / 1024).toFixed(1)} MB • Modified {new Date(blob.lastModified).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-blue-600">Cloud</Badge>
                            <Button size="sm" variant="outline" className="border-navy-600 text-white hover:bg-navy-600" title="View Document">
                              {refDocLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Azure Blob Document Viewer Dialog */}
      <Dialog open={!!refDocUrl} onOpenChange={(open) => { if (!open) setRefDocUrl(null); }}>
        <DialogContent className="bg-navy-900 border-navy-600 text-white max-w-5xl max-h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center justify-between">
              <span>Document Viewer</span>
              <Button
                size="sm"
                variant="outline"
                className="border-navy-600 text-white hover:bg-navy-600"
                onClick={() => refDocUrl && window.open(refDocUrl, "_blank")}
              >
                <Download className="w-4 h-4 mr-1" /> Open in New Tab
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {refDocUrl && (
              <iframe
                src={refDocUrl}
                className="w-full h-[80vh] rounded border border-navy-600"
                title="Reference Document"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reference Document Viewer Dialog */}
      <Dialog open={!!selectedRefDoc} onOpenChange={(open) => { if (!open) setSelectedRefDoc(null); }}>
        <DialogContent className="bg-navy-900 border-navy-600 text-white max-w-4xl max-h-[92vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-amber-400">
              {selectedRefDoc?.name || "Reference Document"}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 max-h-[80vh]">
            <div className="bg-navy-800/50 rounded-lg p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-navy-400">Category:</span>{" "}
                  <Badge className={getCategoryColor(selectedRefDoc?.category || "")}>{selectedRefDoc?.category}</Badge>
                </div>
                <div>
                  <span className="text-navy-400">File Type:</span>{" "}
                  <span className="text-white font-mono">{selectedRefDoc?.fileType}</span>
                </div>
                <div>
                  <span className="text-navy-400">Version:</span>{" "}
                  <span className="text-white">{selectedRefDoc?.version}</span>
                </div>
                <div>
                  <span className="text-navy-400">Uploaded:</span>{" "}
                  <span className="text-white">{selectedRefDoc?.uploadedAt ? new Date(selectedRefDoc.uploadedAt).toLocaleDateString() : "N/A"}</span>
                </div>
              </div>
              {selectedRefDoc?.description && (
                <div>
                  <h4 className="text-navy-400 text-sm mb-1">Description</h4>
                  <p className="text-white text-sm">{selectedRefDoc.description}</p>
                </div>
              )}
              <div className="border-t border-navy-600 pt-4">
                <h4 className="text-amber-400 font-semibold mb-3">Document Content</h4>
                {selectedRefDoc?.id === "1" && (
                  <div className="space-y-2 text-sm text-navy-100">
                    <p className="font-bold text-white">US Navy Diving Manual, Revision 7</p>
                    <p>The US Navy Diving Manual (NDCM) is the comprehensive reference for all US Navy diving operations. It covers air diving, mixed gas diving, saturation diving, and submarine rescue operations.</p>
                    <p className="font-semibold text-amber-400 mt-3">Key Chapters:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Chapter 1: History of Diving</li>
                      <li>Chapter 2: Underwater Physics</li>
                      <li>Chapter 3: Underwater Physiology and Diving Disorders</li>
                      <li>Chapter 9: Air Decompression (Surface-Supplied and SCUBA)</li>
                      <li>Chapter 14: Dive Record Keeping and Documentation</li>
                      <li>Chapter 15: Diver Medical Standards and Certification</li>
                    </ul>
                    <p className="mt-2">This document provides the decompression tables, treatment tables, and operational procedures referenced throughout DiveOps.</p>
                  </div>
                )}
                {selectedRefDoc?.id === "2" && (
                  <div className="space-y-2 text-sm text-navy-100">
                    <p className="font-bold text-white">OSHA Commercial Diving Operations - 29 CFR 1926.1071-1926.1090</p>
                    <p>OSHA standards for commercial diving operations establish safety requirements for diving in construction, ship repair, and other commercial applications.</p>
                    <p className="font-semibold text-amber-400 mt-3">Key Sections:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>1926.1071 - Scope and Application</li>
                      <li>1926.1076 - Qualifications of Dive Team</li>
                      <li>1926.1080 - Safe Practices Manual</li>
                      <li>1926.1084 - Surface-Supplied Air Diving</li>
                      <li>1926.1090 - Record Keeping Requirements</li>
                    </ul>
                  </div>
                )}
                {selectedRefDoc?.id === "3" && (
                  <div className="space-y-2 text-sm text-navy-100">
                    <p className="font-bold text-white">Decompression Tables - Air</p>
                    <p>Standard air decompression tables for surface-supplied and SCUBA diving operations. Based on US Navy Revision 7 tables.</p>
                    <p className="font-semibold text-amber-400 mt-3">Table Groups:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>No-Decompression Limits and Repetitive Group Designators</li>
                      <li>Air Decompression Table (Surface Decompression)</li>
                      <li>Residual Nitrogen Timetable</li>
                      <li>Sea Level Equivalent Depth Table</li>
                    </ul>
                  </div>
                )}
                {selectedRefDoc?.id === "4" && (
                  <div className="space-y-2 text-sm text-navy-100">
                    <p className="font-bold text-white">Emergency Procedures Guide v3.2</p>
                    <p>Standard operating procedures for emergency response during diving operations.</p>
                    <p className="font-semibold text-amber-400 mt-3">Emergency Procedures:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Loss of Primary Air Supply</li>
                      <li>Fouled Diver Procedures</li>
                      <li>Unconscious Diver Recovery</li>
                      <li>Decompression Sickness Treatment</li>
                      <li>Chamber Operations - Emergency</li>
                      <li>Man Overboard Procedures</li>
                      <li>Fire and Abandon Ship</li>
                    </ul>
                  </div>
                )}
                {selectedRefDoc?.id === "5" && (
                  <div className="space-y-2 text-sm text-navy-100">
                    <p className="font-bold text-white">Equipment Maintenance Log Template</p>
                    <p>Standardized template for tracking equipment maintenance, inspections, and certifications.</p>
                    <p className="font-semibold text-amber-400 mt-3">Tracked Items:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Dive Helmets - Annual inspection and certification</li>
                      <li>Umbilicals - Pressure testing and visual inspection</li>
                      <li>Compressors - Air quality testing and maintenance</li>
                      <li>Communications - Function testing</li>
                      <li>Bailout systems - Hydrostatic testing</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewId} onOpenChange={(open) => { if (!open) setPreviewId(null); }}>
        <DialogContent className="bg-navy-900 border-navy-600 text-white max-w-4xl max-h-[92vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center justify-between">
              <span data-testid="preview-title">{previewData?.fileName || "Document Preview"}</span>
              <div className="flex items-center gap-2">
                {previewId && (
                  <Button
                    size="sm"
                    data-testid="preview-download"
                    onClick={() => handleDownload(previewId, previewData?.fileName || "")}
                    className="btn-gold-metallic"
                  >
                    <Download className="w-4 h-4 mr-1" /> Download
                  </Button>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 max-h-[80vh]">
            {previewError ? (
              <div className="flex items-center justify-center py-12">
                <span className="text-red-400">Failed to load preview. Try downloading instead.</span>
              </div>
            ) : previewLoading || !previewData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                <span className="ml-2 text-navy-400">Loading preview...</span>
              </div>
            ) : (
              <div className="bg-navy-800/50 rounded-lg p-6 font-mono text-sm leading-relaxed whitespace-pre-wrap" data-testid="preview-content">
                {previewData.lines && previewData.lines.length > 0 ? (
                  previewData.lines.map((line, i) => {
                    const isBold = line === line.toUpperCase() && line.length > 3 && !/^\d/.test(line);
                    const isHeader = line.includes("—") || line.startsWith("Dive #") || line.includes("DAILY") || line.includes("MASTER") || line.includes("RISK") || line.includes("LOG");
                    return (
                      <div key={i} className={`${isBold ? "text-amber-400 font-bold mt-3" : isHeader ? "text-cyan-400 font-semibold mt-2" : "text-white/80"}`}>
                        {line}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-navy-400">{previewData.content}</div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
