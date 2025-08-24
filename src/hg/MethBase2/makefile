kentSrc = ../..
include ../../inc/common.mk

L += $(MYSQLLIBS) -lm
MYLIBDIR = ../../lib/$(MACHTYPE)
MYLIBS =  $(MYLIBDIR)/jkhgapcgi.a $(MYLIBDIR)/jkhgap.a $(MYLIBDIR)/jkweb.a

A = hgMethBase2

O = hgMethBase2.o

include ../../inc/cgi_build_rules.mk

install::
	rm -fr ${DESTDIR}${CGI_BIN}/hgMethBase2
	rsync -ar --exclude=CVS/ --exclude=.svn/ --delete hgMethBase2 \
		${DESTDIR}${CGI_BIN}/
	chmod -R a+rX ${DESTDIR}${CGI_BIN}/hgMethBase2

alpha::
	rm -fr ${CGI_BIN}/hgMethBase2
	rsync -ar --exclude=CVS/ --exclude=.svn/ --delete hgMethBase2 ${CGI_BIN}/
	chmod -R g+w ${CGI_BIN}/hgMethBase2
	chmod -R a+rX ${CGI_BIN}/hgMethBase2

beta::
	rm -fr ${CGI_BIN}-beta/hgMethBase2
	rsync -ar --exclude=CVS/ --exclude=.svn/ --delete hgMethBase2 ${CGI_BIN}-beta/
	chmod -R g+w ${CGI_BIN}-beta/hgMethBase2
	chmod -R a+rX ${CGI_BIN}-beta/hgMethBase2

compile: $O 
	${CC} $O ${MYLIBS} ${L}
	mv ${AOUT} $A${EXE}

test:
	${CGI_BIN}-${USER}/$A hgg_gene=D43968 hgg_chrom=chr21 hgg_start=35080500 hgg_end=35181383 db=hg16 hgsid=68172
