import { useQuery } from "@tanstack/react-query";
import { getBusinessProfile, type BusinessProfile, type BusinessType } from "@/lib/saas-api";

/**
 * Loads the tenant's business type + effective feature flags. Used to drive
 * dynamic UI routing across the POS surfaces.
 *
 * Cached for 5 minutes; mutations on the settings page should invalidate
 * `["business-profile"]` to force a refetch.
 */
export function useBusinessProfile() {
  const q = useQuery<BusinessProfile>({
    queryKey: ["business-profile"],
    queryFn: getBusinessProfile,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const businessType: BusinessType = q.data?.businessType ?? "restaurant";
  const features = q.data?.features ?? {};

  return {
    profile: q.data,
    businessType,
    features,
    isLoading: q.isLoading,
    /** True if the feature is enabled for this tenant. Unknown flags = false. */
    has: (key: string) => features[key] === true,
    /** True for restaurant or hybrid. */
    isRestaurant: businessType === "restaurant" || businessType === "hybrid",
    /** True for retail, wholesale, or hybrid. */
    isRetail: businessType === "retail" || businessType === "wholesale" || businessType === "hybrid",
    isHybrid: businessType === "hybrid",
  };
}
