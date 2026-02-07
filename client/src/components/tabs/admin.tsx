import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

interface Project {
  id: string;
  name: string;
  clientName: string;
  jobsiteName: string;
  jobsiteAddress?: string;
  timezone?: string;
}

interface ProjectMember {
  userId: string;
  projectId: string;
  role: string;
  user?: {
    id: string;
    username: string;
    fullName?: string;
    initials?: string;
  };
}

interface DirectoryFacility {
  id: string;
  name: string;
  facilityType: string;
  address: string;
  phone: string;
  travelTimeMinutes?: number;
  verifiedBy?: string;
  lastVerifiedAt?: string;
}

export function AdminTab() {
  const { isAdmin, isGod } = useAuth();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState("projects");

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: facilities = [] } = useQuery<DirectoryFacility[]>({
    queryKey: ["directory-facilities"],
    queryFn: async () => {
      const res = await fetch("/api/directory-facilities", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const getFacilityTypeColor = (type: string) => {
    switch (type) {
      case "chamber": return "btn-gold-metallic";
      case "hospital": return "bg-red-600";
      case "coastguard": return "bg-orange-600";
      default: return "bg-gray-600";
    }
  };

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-navy-400">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="h-full p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Administration</h2>
        <p className="text-sm text-navy-400">
          Manage projects, users, and system settings
        </p>
      </div>

      <Tabs value={activeSection} onValueChange={setActiveSection} className="h-[calc(100vh-160px)]">
        <TabsList className="bg-navy-800 border-navy-600 mb-4">
          <TabsTrigger
            data-testid="admin-tab-projects"
            value="projects"
            className="data-[state=active]:bg-navy-700"
          >
            Projects
          </TabsTrigger>
          <TabsTrigger
            data-testid="admin-tab-directory"
            value="directory"
            className="data-[state=active]:bg-navy-700"
          >
            Facility Directory
          </TabsTrigger>
          {isGod && (
            <TabsTrigger
              data-testid="admin-tab-system"
              value="system"
              className="data-[state=active]:bg-navy-700"
            >
              System
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="projects" className="h-full mt-0">
          <ScrollArea className="h-[calc(100vh-240px)]">
            <div className="grid gap-4">
              {projects.map((project) => (
                <Card
                  key={project.id}
                  data-testid={`project-card-${project.id}`}
                  className="bg-navy-800/50 border-navy-600"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white text-base">{project.name}</CardTitle>
                      <Badge className="bg-green-600">Active</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <Label className="text-navy-400">Client</Label>
                        <p className="text-white">{project.clientName}</p>
                      </div>
                      <div>
                        <Label className="text-navy-400">Jobsite</Label>
                        <p className="text-white">{project.jobsiteName}</p>
                      </div>
                      {project.jobsiteAddress && (
                        <div className="col-span-2">
                          <Label className="text-navy-400">Address</Label>
                          <p className="text-white">{project.jobsiteAddress}</p>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button
                        data-testid={`button-edit-project-${project.id}`}
                        size="sm"
                        variant="outline"
                        className="border-navy-500"
                      >
                        Edit
                      </Button>
                      <Button
                        data-testid={`button-manage-team-${project.id}`}
                        size="sm"
                        variant="outline"
                        className="border-navy-500"
                      >
                        Manage Team
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {projects.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-navy-400">No projects found</p>
                  <Button className="mt-4 btn-gold-metallic hover:btn-gold-metallic">
                    Create First Project
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="directory" className="h-full mt-0">
          <ScrollArea className="h-[calc(100vh-240px)]">
            <div className="grid gap-4">
              {facilities.map((facility) => (
                <Card
                  key={facility.id}
                  data-testid={`facility-card-${facility.id}`}
                  className="bg-navy-800/50 border-navy-600"
                >
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-white font-medium">{facility.name}</h3>
                          <Badge className={getFacilityTypeColor(facility.facilityType)}>
                            {facility.facilityType}
                          </Badge>
                        </div>
                        <p className="text-sm text-navy-400 mt-1">{facility.address}</p>
                        <p className="text-sm text-navy-400">{facility.phone}</p>
                      </div>
                      <div className="text-right">
                        {facility.travelTimeMinutes && (
                          <p className="text-sm text-amber-400">
                            {facility.travelTimeMinutes} min
                          </p>
                        )}
                        {facility.lastVerifiedAt && (
                          <p className="text-xs text-navy-500">
                            Verified {new Date(facility.lastVerifiedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <Button
                data-testid="button-add-facility"
                className="btn-gold-metallic hover:btn-gold-metallic w-full"
              >
                Add Facility
              </Button>
            </div>
          </ScrollArea>
        </TabsContent>

        {isGod && (
          <TabsContent value="system" className="h-full mt-0">
            <div className="grid gap-4">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader>
                  <CardTitle className="text-white text-base">System Controls</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-navy-400">AI Model</Label>
                      <p className="text-white font-mono">gpt-5.2</p>
                    </div>
                    <div>
                      <Label className="text-navy-400">Prompt Version</Label>
                      <p className="text-white font-mono">v1.0</p>
                    </div>
                    <Button
                      data-testid="button-regenerate-renders"
                      variant="outline"
                      className="border-navy-500"
                    >
                      Regenerate All AI Renders
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
