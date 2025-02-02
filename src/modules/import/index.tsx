/* eslint react-hooks/exhaustive-deps: 0 */
import s from './style.module.scss';

import _noop from 'lodash/noop';

import React, { useCallback, useContext, useEffect, useState, useRef, useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import cn from 'classnames';

import { PauseCircle, RefreshCw, CheckCircle, XCircle, Home } from 'react-feather';
import { useStyletron } from 'baseui';
import { toaster, ToasterContainer, PLACEMENT } from 'baseui/toast';
import { Button } from 'baseui/button';

import Sources from 'src/share/constants/sources';
import {
  prepareReimport,
  updateFetchingSource,
  importBuildFailed,
  importBuildSucceed,
} from 'src/share/actions';
import { removeFolderContent } from 'src/share/file';
import OpGGImporter from 'src/service/data-source/op-gg';
import LolQQImporter from 'src/service/data-source/lol-qq';
import MbImporter from 'src/service/data-source/murderbridge';

import config from 'src/native/config';
import AppContext from 'src/share/context';
import WaitingList from 'src/components/waiting-list';
import SourceProto from 'src/service/data-source/source-proto';

export default function Import() {
  const history = useHistory();
  const [, theme] = useStyletron();
  const [t] = useTranslation();

  const lolDir = config.get(`lolDir`);
  const lolVer = config.get(`lolVer`);

  const { store, dispatch } = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [cancelled, setCancel] = useState<string[]>([]);

  const workers = useRef<{
    [key: string]: SourceProto;
  }>({});

  const importFromSources = useCallback(async () => {
    const { selectedSources, keepOld, fetched } = store;

    setLoading(true);
    if (fetched.length) {
      dispatch(prepareReimport());
    }
    dispatch(updateFetchingSource(selectedSources));

    let cleanFolderTask = () => Promise.resolve();
    if (!keepOld) {
      cleanFolderTask = () =>
        removeFolderContent(`${lolDir}/Game/Config/Champions`).then(() => {
          toaster.positive(t(`removed outdated items`), {});
        });
    }

    const { itemMap } = store;
    let opggTask = _noop;
    let lolqqTask = _noop;
    let mbTask = _noop;

    if (selectedSources.includes(Sources.Lolqq)) {
      const instance = new LolQQImporter(lolDir, itemMap, dispatch);
      workers.current[Sources.Lolqq] = instance;

      lolqqTask = () =>
        instance
          .import()
          .then(() => {
            toaster.positive(`[${Sources.Lolqq.toUpperCase()}] ${t(`completed`)}`, {});
            dispatch(importBuildSucceed(Sources.Lolqq));
          })
          .catch((err) => {
            if (err.message.includes(`Error: Cancel`)) {
              setCancel(cancelled.concat(Sources.Lolqq));
              toaster.warning(`${t(`cancelled`)}: ${Sources.Lolqq}`, {});
            } else {
              dispatch(importBuildFailed(Sources.Lolqq));
              toaster.negative(`${t(`import failed`)}: ${Sources.Lolqq}`, {});
              console.error(err);
            }
          });
    }

    if (selectedSources.includes(Sources.MurderBridge)) {
      const instance = new MbImporter(lolDir, dispatch);
      mbTask = () =>
        instance.importFromCDN().then(() => {
          toaster.positive(`[${Sources.MurderBridge.toUpperCase()}] ${t(`completed`)}`, {});
          dispatch(importBuildSucceed(Sources.MurderBridge));
        });
    }

    if (selectedSources.includes(Sources.Opgg)) {
      const instance = new OpGGImporter(lolVer, lolDir, itemMap, dispatch);
      workers.current[Sources.Opgg] = instance;

      opggTask = () =>
        instance
          .importFromCdn(lolDir)
          .then((result) => {
            const { rejected } = result;
            if (!rejected.length) {
              toaster.positive(`[${Sources.Opgg.toUpperCase()}] ${t(`completed`)}`, {});
              dispatch(importBuildSucceed(Sources.Opgg));
            }
          })
          .catch((err) => {
            if (err.message.includes(`Error: Cancel`)) {
              setCancel(cancelled.concat(Sources.Opgg));
              toaster.warning(`${t(`cancelled`)}: ${Sources.Opgg}`, {});
            } else {
              dispatch(importBuildFailed(Sources.Opgg));
              toaster.negative(`${t(`import failed`)}: ${Sources.Opgg}`, {});
              console.error(err);
            }
          });
    }

    await cleanFolderTask();

    try {
      await Promise.all([opggTask(), lolqqTask(), mbTask()]);
    } finally {
      setLoading(false);
    }
  }, [store]);

  const stop = () => {
    setLoading(false);
    setCancel(Object.keys(workers.current));

    const ins = Object.values(workers.current);
    ins.map((i) => i.cancel());
  };

  const restart = () => {
    importFromSources();
  };

  const userCancelled = useMemo(() => cancelled.length > 0, [cancelled]);

  const renderStatus = () => {
    if (loading) {
      return (
        <>
          <WaitingList/>
          {/* @ts-ignore */}
          <Button className={s.back} onClick={stop}>
            {t(`stop`)}
          </Button>
        </>
      );
    }

    if (userCancelled) {
      return (
        <>
          <PauseCircle size={128} color={theme.colors.contentWarning}/>
          <Button
            // @ts-ignore
            className={s.back}
            /* @ts-ignore */
            startEnhancer={<RefreshCw title={'Restart'}/>}
            onClick={restart}
            overrides={{
              BaseButton: {
                style: ({ $theme }) => {
                  return {
                    backgroundColor: $theme.colors.contentPositive,
                  };
                },
              },
            }}>
            {t(`restart`)}
          </Button>
          <Button
            // @ts-ignore
            className={s.back}
            // @ts-ignore
            startEnhancer={<XCircle title={'Homepage'}/>}
            onClick={backToHome}
            overrides={{
              BaseButton: {
                style: ({ $theme }) => {
                  return {
                    backgroundColor: $theme.colors.negative,
                  };
                },
              },
            }}>
            {t(`cancel`)}
          </Button>
        </>
      );
    }

    const failed = store.importPage.fail.length > 0;

    // @ts-ignore
    return (
      <>
        {!failed && <CheckCircle size={128} color={theme.colors.contentPositive}/>}
        {failed && (
          <div className={s.failed}>
            {t(`rejected`)}: {store.importPage.fail.join(`, `)}
          </div>
        )}
        {/* @ts-ignore */}
        <Button className={s.back} onClick={backToHome} startEnhancer={<Home title={`Home`}/>}>
          {t(`back to home`)}
        </Button>
      </>
    );
  };

  const backToHome = useCallback(() => history.replace(`/`), []);

  useEffect(() => {
    if (!store.itemMap && !process.env.IS_DEV) {
      return history.replace('/');
    }

    importFromSources();
  }, []);

  return (
    <div className={cn(s.import, loading && s.ing)}>
      {renderStatus()}
      <ToasterContainer autoHideDuration={1500} placement={PLACEMENT.bottom}/>
    </div>
  );
}
