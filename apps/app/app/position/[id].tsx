import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PositionDetailScreen } from '@clmm/ui';
import { Text, View } from 'react-native';
import { useStore } from 'zustand';
import { fetchPositionDetail } from '../../src/api/positions';
import {
  fetchCurrentPlan,
  recordPlanDecision,
  requestPlanPreview,
  approvePlanExit,
} from '../../src/api/plans';
import { navigateRoute } from '../../src/platform/webNavigation';
import { walletSessionStore } from '../../src/state/walletSessionStore';
import { RequireWallet } from '../../src/wallet-boot/RequireWallet';

export default function PositionDetailRoute() {
  return (
    <RequireWallet>
      <PositionDetailRouteBody />
    </RequireWallet>
  );
}

function PositionDetailRouteBody() {
  const { id, triggerId } = useLocalSearchParams<{
    id?: string | string[];
    triggerId?: string | string[];
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const positionId = typeof id === 'string' ? id : undefined;
  const alertTriggerId =
    typeof triggerId === 'string' && triggerId.length > 0 ? triggerId : undefined;
  const hasValidPositionId = positionId != null && positionId.length > 0;

  const positionQuery = useQuery({
    queryKey: ['position-detail', walletAddress, positionId],
    queryFn: () => fetchPositionDetail(walletAddress!, positionId!),
    enabled: walletAddress != null && hasValidPositionId,
  });

  const planQuery = useQuery({
    queryKey: ['position-plan', walletAddress, positionId],
    queryFn: () => fetchCurrentPlan(walletAddress!, positionId!),
    enabled: walletAddress != null && hasValidPositionId,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (planId: string) =>
      recordPlanDecision(walletAddress!, positionId!, planId, 'acknowledged'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['position-plan', walletAddress, positionId],
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: (planId: string) => requestPlanPreview(walletAddress!, positionId!, planId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['position-plan', walletAddress, positionId],
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ planId, previewId }: { planId: string; previewId: string }) =>
      approvePlanExit(walletAddress!, positionId!, planId, previewId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['position-plan', walletAddress, positionId],
      });
    },
  });

  if (!hasValidPositionId) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Text>Position not found.</Text>
      </View>
    );
  }

  if (positionQuery.isError) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Text>Could not load position detail for this wallet.</Text>
      </View>
    );
  }

  const position = positionQuery.data;
  const plan = planQuery.data;

  return (
    <PositionDetailScreen
      {...(position ? { position } : {})}
      {...(plan !== undefined ? { plan } : {})}
      onViewPreview={(resolvedTriggerId: string) =>
        navigateRoute({
          router,
          path: `/preview/${alertTriggerId ?? resolvedTriggerId}`,
          method: 'push',
        })
      }
      onPlanAcknowledge={(planId: string) => acknowledgeMutation.mutate(planId)}
      onPlanPreview={(planId: string) => previewMutation.mutate(planId)}
      onPlanApprove={(planId: string, previewId: string) =>
        approveMutation.mutate({ planId, previewId })
      }
    />
  );
}
