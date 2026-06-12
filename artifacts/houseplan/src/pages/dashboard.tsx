import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import type { Room } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Home,
  Plus,
  LogOut,
  Layers,
  Tag,
  AlertTriangle,
  ChevronRight,
  LayoutGrid,
} from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [maintenanceSoon, setMaintenanceSoon] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);
    const { data: roomsData } = await supabase
      .from("rooms")
      .select("*")
      .order("created_at", { ascending: false });

    if (roomsData) {
      setRooms(roomsData);

      const counts: Record<string, number> = {};
      let total = 0;
      let soon = 0;
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      for (const room of roomsData) {
        const { data: items } = await supabase
          .from("room_items")
          .select("id, next_maintenance")
          .eq("room_id", room.id);
        counts[room.id] = items?.length ?? 0;
        total += items?.length ?? 0;
        soon += items?.filter(
          (i) => i.next_maintenance && new Date(i.next_maintenance) <= thirtyDaysFromNow
        ).length ?? 0;
      }

      setItemCounts(counts);
      setTotalItems(total);
      setMaintenanceSoon(soon);
    }
    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setLocation("/");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary rounded-md p-1.5">
              <Home className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-base">HousePlan</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              data-testid="button-signout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Your Rooms</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Track every component of your home
            </p>
          </div>
          <Link href="/rooms/new">
            <Button data-testid="button-new-room">
              <Plus className="h-4 w-4 mr-2" />
              Add Room
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 rounded-lg p-2">
                  <LayoutGrid className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{loading ? "—" : rooms.length}</p>
                  <p className="text-xs text-muted-foreground">Total rooms</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 rounded-lg p-2">
                  <Tag className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{loading ? "—" : totalItems}</p>
                  <p className="text-xs text-muted-foreground">Labelled items</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="bg-destructive/10 rounded-lg p-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{loading ? "—" : maintenanceSoon}</p>
                  <p className="text-xs text-muted-foreground">Due in 30 days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed rounded-xl">
            <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No rooms yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Add your first room to start building your house log.
            </p>
            <Link href="/rooms/new">
              <Button data-testid="button-empty-new-room">
                <Plus className="h-4 w-4 mr-2" />
                Add your first room
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <Link key={room.id} href={`/rooms/${room.id}`}>
                <Card
                  className="cursor-pointer hover:border-primary/50 transition-colors group"
                  data-testid={`card-room-${room.id}`}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{room.name}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </CardTitle>
                    {room.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{room.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        <Tag className="h-3 w-3 mr-1" />
                        {itemCounts[room.id] ?? 0} items
                      </Badge>
                      {room.floor_area && (
                        <Badge variant="outline" className="text-xs">
                          {room.floor_area} m²
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Added {new Date(room.created_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
