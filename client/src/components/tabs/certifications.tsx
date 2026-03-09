import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProject } from "@/hooks/use-project";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  FileText,
  Trash2,
  Edit2,
  ArrowUpDown,
  Users,
  Wrench,
  X,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DiverCertification {
  id: string;
  userId: string;
  projectId?: string;
  certName?: string;
  certType: string;
  certNumber?: string;
  issuingAuthority?: string;
  issuedDate?: string;
  expirationDate?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  status: string;
  documentUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface EquipmentCertification {
  id: string;
  equipmentName: string;
  equipmentCategory: string;
  equipmentType?: string;
  serialNumber?: string;
  certName?: string;
  certType: string;
  certNumber?: string;
  issuingAuthority?: string;
  issuedDate?: string;
  expirationDate?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  status: string;
  documentUrl?: string;
  notes?: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

interface UserInfo {
  id: string;
  username: string;
  fullName?: string;
  role: string;
}

// ─── Cert Type Options ──────────────────────────────────────────────────────

const PERSONNEL_CERT_TYPES = [
  "ADCI Diver",
  "ADCI Supervisor",
  "ADCI Tender",
  "ADCI DMT",
  "ADCI LST",
  "IMCA Diver",
  "IMCA Supervisor",
  "First Aid/CPR",
  "Medical Fitness",
  "Rigging",
  "Crane Operator",
  "Forklift Operator",
  "HAZWOPER",
  "TWIC Card",
  "Passport",
  "BOSIET/HUET",
  "Other",
];

const EQUIPMENT_CERT_TYPES = [
  "Annual Inspection",
  "Hydrostatic Test",
  "Calibration",
  "Load Test",
  "NDT Inspection",
  "Pressure Test",
  "Manufacturer Service",
  "Third Party Inspection",
  "Other",
];

const EQUIPMENT_CATEGORIES = [
  "Diving Helmet",
  "Diving Suit",
  "Umbilical",
  "Compressor",
  "HPU",
  "Chamber/Habitat",
  "Gas Panel",
  "Communication System",
  "Camera/Video",
  "Crane/Winch",
  "Rigging Equipment",
  "Safety Equipment",
  "Tools",
  "Other",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCertStatus(expirationDate?: string): { label: string; color: string; daysLeft: number | null } {
  if (!expirationDate) return { label: "No Expiry", color: "bg-navy-600 text-navy-300", daysLeft: null };
  const now = new Date();
  const exp = new Date(expirationDate);
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: "EXPIRED", color: "bg-red-600 text-white", daysLeft };
  if (daysLeft <= 30) return { label: `${daysLeft}d left`, color: "bg-yellow-600 text-white", daysLeft };
  if (daysLeft <= 90) return { label: `${daysLeft}d left`, color: "bg-amber-600 text-white", daysLeft };
  return { label: "Active", color: "bg-green-600 text-white", daysLeft };
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Main Tab Component ─────────────────────────────────────────────────────

export function CertificationsTab() {
  const { user, isSupervisor } = useAuth();
  const { activeProject } = useProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeView, setActiveView] = useState<"personnel" | "equipment">("personnel");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCertType, setFilterCertType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"expiration" | "name" | "type">("expiration");
  const [sortAsc, setSortAsc] = useState(true);

  // Dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCert, setEditingCert] = useState<DiverCertification | EquipmentCertification | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Form state for personnel cert
  const [formUserId, setFormUserId] = useState("");
  const [formCertName, setFormCertName] = useState("");
  const [formCertType, setFormCertType] = useState("");
  const [formCertNumber, setFormCertNumber] = useState("");
  const [formIssuingAuthority, setFormIssuingAuthority] = useState("");
  const [formIssuedDate, setFormIssuedDate] = useState("");
  const [formExpirationDate, setFormExpirationDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formDocumentUrl, setFormDocumentUrl] = useState("");

  // Form state for equipment cert (additional fields)
  const [formEquipmentName, setFormEquipmentName] = useState("");
  const [formEquipmentCategory, setFormEquipmentCategory] = useState("");
  const [formEquipmentType, setFormEquipmentType] = useState("");
  const [formSerialNumber, setFormSerialNumber] = useState("");

  const projectId = activeProject?.id;

  // ─── Queries ────────────────────────────────────────────────────────────

  const { data: users = [] } = useQuery<UserInfo[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: diverCerts = [], isLoading: loadingDiver } = useQuery<DiverCertification[]>({
    queryKey: ["diver-certifications", projectId],
    queryFn: async () => {
      const url = projectId
        ? `/api/diver-certifications?projectId=${projectId}`
        : "/api/diver-certifications";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: equipCerts = [], isLoading: loadingEquip } = useQuery<EquipmentCertification[]>({
    queryKey: ["equipment-certifications", projectId],
    queryFn: async () => {
      const url = projectId
        ? `/api/equipment-certifications?projectId=${projectId}`
        : "/api/equipment-certifications";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: certStats } = useQuery<{ active: number; expiring: number; expired: number }>({
    queryKey: ["certifications-stats", projectId],
    queryFn: async () => {
      const url = projectId
        ? `/api/certifications/stats?projectId=${projectId}`
        : "/api/certifications/stats";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return { active: 0, expiring: 0, expired: 0 };
      return res.json();
    },
  });

  // ─── Mutations ──────────────────────────────────────────────────────────

  const createDiverCert = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/diver-certifications", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diver-certifications"] });
      queryClient.invalidateQueries({ queryKey: ["certifications-stats"] });
      queryClient.invalidateQueries({ queryKey: ["certifications-expiring"] });
      toast({ title: "Certification added", description: "Personnel certification created successfully." });
      resetForm();
      setShowAddDialog(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateDiverCert = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/diver-certifications/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diver-certifications"] });
      queryClient.invalidateQueries({ queryKey: ["certifications-stats"] });
      queryClient.invalidateQueries({ queryKey: ["certifications-expiring"] });
      toast({ title: "Updated", description: "Certification updated successfully." });
      resetForm();
      setEditingCert(null);
      setShowAddDialog(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteDiverCert = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/diver-certifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diver-certifications"] });
      queryClient.invalidateQueries({ queryKey: ["certifications-stats"] });
      queryClient.invalidateQueries({ queryKey: ["certifications-expiring"] });
      toast({ title: "Deleted", description: "Certification removed." });
      setShowDeleteConfirm(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const createEquipCert = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/equipment-certifications", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment-certifications"] });
      queryClient.invalidateQueries({ queryKey: ["certifications-stats"] });
      queryClient.invalidateQueries({ queryKey: ["certifications-expiring"] });
      toast({ title: "Certification added", description: "Equipment certification created successfully." });
      resetForm();
      setShowAddDialog(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateEquipCert = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/equipment-certifications/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment-certifications"] });
      queryClient.invalidateQueries({ queryKey: ["certifications-stats"] });
      queryClient.invalidateQueries({ queryKey: ["certifications-expiring"] });
      toast({ title: "Updated", description: "Equipment certification updated." });
      resetForm();
      setEditingCert(null);
      setShowAddDialog(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteEquipCert = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/equipment-certifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment-certifications"] });
      queryClient.invalidateQueries({ queryKey: ["certifications-stats"] });
      queryClient.invalidateQueries({ queryKey: ["certifications-expiring"] });
      toast({ title: "Deleted", description: "Equipment certification removed." });
      setShowDeleteConfirm(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // ─── Form Helpers ───────────────────────────────────────────────────────

  function resetForm() {
    setFormUserId("");
    setFormCertName("");
    setFormCertType("");
    setFormCertNumber("");
    setFormIssuingAuthority("");
    setFormIssuedDate("");
    setFormExpirationDate("");
    setFormNotes("");
    setFormDocumentUrl("");
    setFormEquipmentName("");
    setFormEquipmentCategory("");
    setFormEquipmentType("");
    setFormSerialNumber("");
    setEditingCert(null);
  }

  function openAddDialog() {
    resetForm();
    setShowAddDialog(true);
  }

  function openEditDialog(cert: DiverCertification | EquipmentCertification) {
    setEditingCert(cert);
    if (activeView === "personnel") {
      const dc = cert as DiverCertification;
      setFormUserId(dc.userId);
      setFormCertName(dc.certName || "");
      setFormCertType(dc.certType);
      setFormCertNumber(dc.certNumber || "");
      setFormIssuingAuthority(dc.issuingAuthority || "");
      setFormIssuedDate(dc.issuedDate ? dc.issuedDate.split("T")[0] : "");
      setFormExpirationDate(dc.expirationDate ? dc.expirationDate.split("T")[0] : "");
      setFormNotes(dc.notes || "");
      setFormDocumentUrl(dc.documentUrl || "");
    } else {
      const ec = cert as EquipmentCertification;
      setFormEquipmentName(ec.equipmentName);
      setFormEquipmentCategory(ec.equipmentCategory);
      setFormEquipmentType(ec.equipmentType || "");
      setFormSerialNumber(ec.serialNumber || "");
      setFormCertName(ec.certName || "");
      setFormCertType(ec.certType);
      setFormCertNumber(ec.certNumber || "");
      setFormIssuingAuthority(ec.issuingAuthority || "");
      setFormIssuedDate(ec.issuedDate ? ec.issuedDate.split("T")[0] : "");
      setFormExpirationDate(ec.expirationDate ? ec.expirationDate.split("T")[0] : "");
      setFormNotes(ec.notes || "");
      setFormDocumentUrl(ec.documentUrl || "");
    }
    setShowAddDialog(true);
  }

  function handleSubmit() {
    if (activeView === "personnel") {
      if (!formUserId || !formCertType) {
        toast({ title: "Validation Error", description: "User and cert type are required.", variant: "destructive" });
        return;
      }
      const data: any = {
        userId: formUserId,
        certType: formCertType,
        certName: formCertName || undefined,
        certNumber: formCertNumber || undefined,
        issuingAuthority: formIssuingAuthority || undefined,
        issuedDate: formIssuedDate ? new Date(formIssuedDate).toISOString() : undefined,
        expirationDate: formExpirationDate ? new Date(formExpirationDate).toISOString() : undefined,
        notes: formNotes || undefined,
        documentUrl: formDocumentUrl || undefined,
        projectId: projectId || undefined,
      };
      if (editingCert) {
        updateDiverCert.mutate({ id: editingCert.id, data });
      } else {
        createDiverCert.mutate(data);
      }
    } else {
      if (!formEquipmentName || !formEquipmentCategory || !formCertType) {
        toast({ title: "Validation Error", description: "Equipment name, category, and cert type are required.", variant: "destructive" });
        return;
      }
      const data: any = {
        equipmentName: formEquipmentName,
        equipmentCategory: formEquipmentCategory,
        equipmentType: formEquipmentType || undefined,
        serialNumber: formSerialNumber || undefined,
        certType: formCertType,
        certName: formCertName || undefined,
        certNumber: formCertNumber || undefined,
        issuingAuthority: formIssuingAuthority || undefined,
        issuedDate: formIssuedDate ? new Date(formIssuedDate).toISOString() : undefined,
        expirationDate: formExpirationDate ? new Date(formExpirationDate).toISOString() : undefined,
        notes: formNotes || undefined,
        documentUrl: formDocumentUrl || undefined,
        projectId: projectId || undefined,
      };
      if (editingCert) {
        updateEquipCert.mutate({ id: editingCert.id, data });
      } else {
        createEquipCert.mutate(data);
      }
    }
  }

  // ─── Filtering & Sorting ──────────────────────────────────────────────

  const getUserName = (userId: string) => {
    const u = users.find((u) => u.id === userId);
    return u?.fullName || u?.username || userId;
  };

  function filterAndSort<T extends { certType: string; expirationDate?: string }>(
    items: T[],
    getNameFn: (item: T) => string
  ): T[] {
    let filtered = items;

    // Filter by search term
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter((item) => {
        const name = getNameFn(item).toLowerCase();
        const type = item.certType.toLowerCase();
        return name.includes(lower) || type.includes(lower);
      });
    }

    // Filter by cert type
    if (filterCertType !== "all") {
      filtered = filtered.filter((item) => item.certType === filterCertType);
    }

    // Filter by status
    if (filterStatus !== "all") {
      filtered = filtered.filter((item) => {
        const status = getCertStatus(item.expirationDate);
        if (filterStatus === "expired") return status.daysLeft !== null && status.daysLeft < 0;
        if (filterStatus === "expiring") return status.daysLeft !== null && status.daysLeft >= 0 && status.daysLeft <= 30;
        if (filterStatus === "active") return status.daysLeft === null || status.daysLeft > 30;
        return true;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "expiration") {
        const aDate = a.expirationDate ? new Date(a.expirationDate).getTime() : Infinity;
        const bDate = b.expirationDate ? new Date(b.expirationDate).getTime() : Infinity;
        cmp = aDate - bDate;
      } else if (sortBy === "name") {
        cmp = getNameFn(a).localeCompare(getNameFn(b));
      } else if (sortBy === "type") {
        cmp = a.certType.localeCompare(b.certType);
      }
      return sortAsc ? cmp : -cmp;
    });

    return filtered;
  }

  const filteredDiverCerts = filterAndSort(diverCerts, (c) => getUserName(c.userId));
  const filteredEquipCerts = filterAndSort(equipCerts, (c) => c.equipmentName);

  const stats = certStats || { active: 0, expiring: 0, expired: 0 };

  const toggleSort = (field: "expiration" | "name" | "type") => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(true);
    }
  };

  const certTypeOptions = activeView === "personnel" ? PERSONNEL_CERT_TYPES : EQUIPMENT_CERT_TYPES;

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden p-4 gap-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        <Card className="bg-card border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <Shield className="h-8 w-8 text-cyan-400" />
            <div>
              <div className="text-2xl font-bold text-foreground">{diverCerts.length + equipCerts.length}</div>
              <div className="text-xs text-muted-foreground">Total Certifications</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-green-400" />
            <div>
              <div className="text-2xl font-bold text-green-400">{stats.active}</div>
              <div className="text-xs text-muted-foreground">Active</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-yellow-400" />
            <div>
              <div className="text-2xl font-bold text-yellow-400">{stats.expiring}</div>
              <div className="text-xs text-muted-foreground">Expiring (30d)</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-red-400" />
            <div>
              <div className="text-2xl font-bold text-red-400">{stats.expired}</div>
              <div className="text-xs text-muted-foreground">Expired</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 shrink-0">
        {/* View Toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => { setActiveView("personnel"); setFilterCertType("all"); }}
            className={`px-4 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors ${
              activeView === "personnel"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Personnel
          </button>
          <button
            onClick={() => { setActiveView("equipment"); setFilterCertType("all"); }}
            className={`px-4 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors ${
              activeView === "equipment"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            Equipment
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={activeView === "personnel" ? "Search by name or cert type..." : "Search by equipment or cert type..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Filter by cert type */}
        <Select value={filterCertType} onValueChange={setFilterCertType}>
          <SelectTrigger className="w-[180px] h-8 text-sm">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Cert Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {certTypeOptions.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filter by status */}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring">Expiring</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>

        {/* Add button */}
        {isSupervisor && (
          <Button size="sm" onClick={openAddDialog} className="btn-gold-metallic gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add Certification
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="flex-1 overflow-hidden bg-card border-border">
        <ScrollArea className="h-full">
          {activeView === "personnel" ? (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => toggleSort("name")}>
                    <div className="flex items-center gap-1">Person <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => toggleSort("type")}>
                    <div className="flex items-center gap-1">Cert Type <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead>Cert Name</TableHead>
                  <TableHead>Cert Number</TableHead>
                  <TableHead>Issuing Authority</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => toggleSort("expiration")}>
                    <div className="flex items-center gap-1">Expiration <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Doc</TableHead>
                  {isSupervisor && <TableHead className="w-[80px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDiverCerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isSupervisor ? 10 : 9} className="text-center py-8 text-muted-foreground">
                      {loadingDiver ? "Loading..." : "No personnel certifications found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDiverCerts.map((cert) => {
                    const status = getCertStatus(cert.expirationDate);
                    return (
                      <TableRow key={cert.id} className="border-border">
                        <TableCell className="font-medium">{getUserName(cert.userId)}</TableCell>
                        <TableCell>{cert.certType}</TableCell>
                        <TableCell className="text-muted-foreground">{cert.certName || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{cert.certNumber || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{cert.issuingAuthority || "—"}</TableCell>
                        <TableCell className="text-xs">{formatDate(cert.issuedDate)}</TableCell>
                        <TableCell className="text-xs">{formatDate(cert.expirationDate)}</TableCell>
                        <TableCell>
                          <Badge className={`${status.color} text-[10px] px-1.5 py-0`}>
                            {status.daysLeft !== null && status.daysLeft < 0 && <AlertTriangle className="h-2.5 w-2.5 mr-0.5 inline" />}
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(cert.documentUrl || cert.fileUrl) ? (
                            <a href={cert.documentUrl || cert.fileUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">
                              <FileText className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {isSupervisor && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(cert)}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300" onClick={() => setShowDeleteConfirm(cert.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => toggleSort("name")}>
                    <div className="flex items-center gap-1">Equipment <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Serial #</TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => toggleSort("type")}>
                    <div className="flex items-center gap-1">Cert Type <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead>Cert Name</TableHead>
                  <TableHead>Issuing Authority</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => toggleSort("expiration")}>
                    <div className="flex items-center gap-1">Expiration <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Doc</TableHead>
                  {isSupervisor && <TableHead className="w-[80px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEquipCerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isSupervisor ? 11 : 10} className="text-center py-8 text-muted-foreground">
                      {loadingEquip ? "Loading..." : "No equipment certifications found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEquipCerts.map((cert) => {
                    const status = getCertStatus(cert.expirationDate);
                    return (
                      <TableRow key={cert.id} className="border-border">
                        <TableCell className="font-medium">{cert.equipmentName}</TableCell>
                        <TableCell className="text-muted-foreground">{cert.equipmentCategory}</TableCell>
                        <TableCell className="font-mono text-xs">{cert.serialNumber || "—"}</TableCell>
                        <TableCell>{cert.certType}</TableCell>
                        <TableCell className="text-muted-foreground">{cert.certName || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{cert.issuingAuthority || "—"}</TableCell>
                        <TableCell className="text-xs">{formatDate(cert.issuedDate)}</TableCell>
                        <TableCell className="text-xs">{formatDate(cert.expirationDate)}</TableCell>
                        <TableCell>
                          <Badge className={`${status.color} text-[10px] px-1.5 py-0`}>
                            {status.daysLeft !== null && status.daysLeft < 0 && <AlertTriangle className="h-2.5 w-2.5 mr-0.5 inline" />}
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(cert.documentUrl || cert.fileUrl) ? (
                            <a href={cert.documentUrl || cert.fileUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">
                              <FileText className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {isSupervisor && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(cert)}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300" onClick={() => setShowDeleteConfirm(cert.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) { resetForm(); setShowAddDialog(false); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCert ? "Edit" : "Add"} {activeView === "personnel" ? "Personnel" : "Equipment"} Certification
            </DialogTitle>
            <DialogDescription>
              {activeView === "personnel"
                ? "Add or update a personnel certification record."
                : "Add or update an equipment certification record."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {activeView === "personnel" ? (
              <>
                <div>
                  <Label>Person *</Label>
                  <Select value={formUserId} onValueChange={setFormUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select person..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.fullName || u.username} ({u.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Equipment Name *</Label>
                    <Input value={formEquipmentName} onChange={(e) => setFormEquipmentName(e.target.value)} placeholder="e.g., KM 37 Helmet" />
                  </div>
                  <div>
                    <Label>Category *</Label>
                    <Select value={formEquipmentCategory} onValueChange={setFormEquipmentCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category..." />
                      </SelectTrigger>
                      <SelectContent>
                        {EQUIPMENT_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Equipment Type</Label>
                    <Input value={formEquipmentType} onChange={(e) => setFormEquipmentType(e.target.value)} placeholder="e.g., Surface Supply" />
                  </div>
                  <div>
                    <Label>Serial Number</Label>
                    <Input value={formSerialNumber} onChange={(e) => setFormSerialNumber(e.target.value)} placeholder="S/N" />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cert Type *</Label>
                <Select value={formCertType} onValueChange={setFormCertType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {certTypeOptions.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cert Name</Label>
                <Input value={formCertName} onChange={(e) => setFormCertName(e.target.value)} placeholder="Certification name" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cert Number</Label>
                <Input value={formCertNumber} onChange={(e) => setFormCertNumber(e.target.value)} placeholder="Certificate #" />
              </div>
              <div>
                <Label>Issuing Authority</Label>
                <Input value={formIssuingAuthority} onChange={(e) => setFormIssuingAuthority(e.target.value)} placeholder="e.g., ADCI, IMCA" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Issued Date</Label>
                <Input type="date" value={formIssuedDate} onChange={(e) => setFormIssuedDate(e.target.value)} />
              </div>
              <div>
                <Label>Expiration Date</Label>
                <Input type="date" value={formExpirationDate} onChange={(e) => setFormExpirationDate(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Document URL</Label>
              <Input value={formDocumentUrl} onChange={(e) => setFormDocumentUrl(e.target.value)} placeholder="https://..." />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setShowAddDialog(false); }}>Cancel</Button>
            <Button onClick={handleSubmit} className="btn-gold-metallic">
              {editingCert ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={(open) => { if (!open) setShowDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Certification</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this certification? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (showDeleteConfirm) {
                  if (activeView === "personnel") {
                    deleteDiverCert.mutate(showDeleteConfirm);
                  } else {
                    deleteEquipCert.mutate(showDeleteConfirm);
                  }
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
