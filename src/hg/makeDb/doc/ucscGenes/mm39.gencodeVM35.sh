# Jonathan - began 2024-02-26

export db=mm39
export GENCODE_VERSION=VM35
export PREV_GENCODE_VERSION=VM34
screen -S knownGene${GENCODE_VERSION}
mkdir /hive/data/genomes/$db/bed/gencode$GENCODE_VERSION/build
cd /hive/data/genomes/$db/bed/gencode$GENCODE_VERSION/build

PATH=$HOME/kent/src/hg/utils/otto/knownGene":$PATH"
cp /hive/data/genomes/${db}/bed/gencode${PREV_GENCODE_VERSION}/build/buildEnv.sh  buildEnv.sh

# edit buildEnv.sh
 . buildEnv.sh

cp ${oldGeneDir}/${PREV_GENCODE_VERSION}.files.txt .

cp ${oldGeneDir}/${PREV_GENCODE_VERSION}.tables.txt .

hgsql ${oldKnownDb} -Ne "show tables" > ${oldKnownDb}.tables.txt
diff <(sort ${PREV_GENCODE_VERSION}.tables.txt) <(sort ${oldKnownDb}.tables.txt)
# no difference

buildKnown.sh &
# wait for completion

tail -n 1 *.log
# ==> doBioCyc.log <==
# BuildBioCyc successfully finished
#
# ==> doBlast.log <==
# BuildBlast successfully finished
#
# ==> doFoldUtr.log <==
# BuildFoldUtr successfully finished
#
# ==> doKnown.log <==
# BuildKnown successfully finished
#
# ==> doKnownTo.log <==
# BuildKnownTo successfully finished
#
# ==> doPfamScop.log <==
# BuildPfamScop successfully finished


